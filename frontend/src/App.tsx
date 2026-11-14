import { useEffect, useState, useRef } from "react";
import type { FormEvent } from "react";
import {
  deleteImages,
  getImage,
  getImages,
  getJob,
  getStats,
  searchImages,
} from "./api";
import type { ImagesResponse, StatsResponse } from "./api";

const buttonClass =
  "rounded-xl bg-indigo-600 px-5 py-3 text-sm font-semibold " +
  "text-white hover:bg-indigo-700 disabled:opacity-40";

function wait(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {
      reject(new DOMException("Aborted", "AbortError"));
      return;
    }

    const onAbort = () => {
      clearTimeout(timer);
      reject(new DOMException("Aborted", "AbortError"));
    };

    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);

    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export default function App() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState({ keyword: "", page: 1 });
  const [data, setData] = useState<ImagesResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [retry, setRetry] = useState(0);
  const [statsVersion, setStatsVersion] = useState(0);
  const [selected, setSelected] = useState<string[]>([]);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteNotice, setDeleteNotice] = useState("");
  const [refresh, setRefresh] = useState(0);
  const resolvedKeyword = useRef("");

  useEffect(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    async function load() {
      setLoading(true);
      setError("");
      setMessage("");
      setData(null);
      setSelected([]);

      try {
        let keyword =
          refresh > 0 ? resolvedKeyword.current : search.keyword;
        let completedImageId: string | undefined;

        if (keyword && refresh === 0) {
          setMessage("Đang tìm trong kho ảnh…");

          const result = await searchImages(keyword, signal);

          if (signal.aborted) return;

          keyword = result.subject || keyword;

          if (result.foundInStore && result.image) {
            completedImageId = String(result.image.id);
          } else {
            if (!result.jobId) {
              throw new Error("Bộ điều phối chưa trả mã nhiệm vụ.");
            }

            const jobId = result.jobId;
            let pollingErrors = 0;

            while (!signal.aborted) {
              setMessage("Đang kiểm tra nhiệm vụ sinh ảnh…");

              let job;
              try {
                job = await getJob(jobId, signal);
                pollingErrors = 0;
              } catch (pollError) {
                if (signal.aborted) return;

                pollingErrors += 1;
                if (pollingErrors >= 3) throw pollError;

                setMessage(
                  "Kết nối tạm gián đoạn, đang kiểm tra lại nhiệm vụ…",
                );
                await wait(3000, signal);
                continue;
              }

              if (signal.aborted) return;

              if (job.status === "completed") {
                if (!job.imageId) {
                  throw new Error("Nhiệm vụ hoàn thành nhưng thiếu ID ảnh.");
                }

                completedImageId = String(job.imageId);
                keyword = job.subject || keyword;
                setStatsVersion((value) => value + 1);
                break;
              }

              if (job.status === "failed") {
                throw new Error(
                  job.error || "Sinh ảnh thất bại. Bạn có thể thử lại.",
                );
              }

              setMessage(
                job.status === "running"
                  ? `Đang tạo ảnh “${keyword}”${job.workerId ? ` bằng AI ${job.workerId}` : ""
                  }…`
                  : `Yêu cầu “${keyword}” đã vào hàng đợi…`,
              );

              await wait(2000, signal);
            }
          }
        }

        if (signal.aborted) return;

        resolvedKeyword.current = keyword;
        setMessage("Đang tải ảnh…");
        const images = await getImages(search.page, keyword, signal);

        if (signal.aborted) return;

        // Nếu tìm kiếm kho chưa trả ảnh vừa hoàn thành,
        // đọc trực tiếp theo ID thay vì để trang trống.
        if (images.items.length === 0 && completedImageId) {
          const image = await getImage(completedImageId, signal);
          if (signal.aborted) return;

          setData({
            mode: "remote",
            items: [image],
            page: 1,
            pageSize: 50,
            total: 1,
            totalPages: 1,
            needsGeneration: false,
          });
        } else {
          if (images.items.length === 0 && search.page > 1) {
            setSearch((current) => ({
              ...current,
              page: Math.max(1, images.totalPages),
            }));
            return;
          }

          setData(images);
        }

        setMessage("");
      } catch (err) {
        if (!signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Đã xảy ra lỗi.",
          );
          setMessage("");
        }
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    }

    void load();

    // Đổi từ khóa hoặc rời trang: dừng theo dõi ở trình duyệt.
    // Job trên server vẫn được xử lý.
    return () => controller.abort();
  }, [search, retry, refresh]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadStats() {
      setStatsError("");

      try {
        const result = await getStats(controller.signal);
        if (!controller.signal.aborted) setStats(result);
      } catch {
        if (!controller.signal.aborted) {
          setStatsError("Không tải được thống kê.");
        }
      }
    }

    void loadStats();
    return () => controller.abort();
  }, [statsVersion, retry]);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (deleting) return;

    setRefresh(0);
    setDeleteNotice("");
    setSearch({ keyword: input.trim(), page: 1 });
  }

  function reset() {
    if (deleting) return;

    setRefresh(0);
    setDeleteNotice("");
    setInput("");
    setSearch({ keyword: "", page: 1 });
    setStatsVersion((value) => value + 1);
  }

  async function removeImages(ids: string[], bulk: boolean) {
    if (deleting || loading || ids.length === 0) return;

    const confirmed = window.confirm(
      `Xóa vĩnh viễn ${ids.length} ảnh khỏi kho?`,
    );

    if (!confirmed) return;

    setDeleting(true);
    setDeleteError("");
    setDeleteNotice("");

    try {
      await deleteImages(ids, bulk);

      setDeleteNotice(
        "Đã gửi yêu cầu xóa. Đang cập nhật danh sách và thống kê từ kho.",
      );
    } catch (err) {
      setDeleteError(
        err instanceof Error ? err.message : "Không xóa được ảnh.",
      );
    } finally {
      // Tải lại cả khi lỗi: kho có thể đã xử lý trước khi mất kết nối.
      setSelected([]);
      setRefresh((value) => value + 1);
      setStatsVersion((value) => value + 1);
      setDeleting(false);
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <button
            onClick={reset}
            className="text-xl font-extrabold"
          >
            <span className="text-indigo-600">Atlas</span> Gallery
          </button>
          <span className="rounded-full bg-indigo-50 px-3 py-2 text-xs text-indigo-700">
            Mondrian geometric
          </span>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-5">
        <section className="py-12 text-center sm:py-16">
          <p className="text-xs font-bold tracking-widest text-indigo-600">
            KHO ẢNH BÁCH KHOA THÔNG MINH
          </p>

          <h1 className="mt-4 text-3xl font-extrabold sm:text-5xl">
            Khám phá thế giới qua hình ảnh
          </h1>

          <p className="mt-5 text-slate-500">
            Tìm bằng tiếng Anh. AI sẽ tạo ảnh mới khi kho chưa có.
          </p>

          <form
            onSubmit={submit}
            role="search"
            className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 sm:flex-row"
          >
            <label htmlFor="query" className="sr-only">
              Từ khóa tiếng Anh
            </label>
            <input
              id="query"
              type="search"
              maxLength={100}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              placeholder="Ví dụ: a yellow bicycle"
              className="min-w-0 flex-1 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-300"
            />
            <button type="submit" className={buttonClass}>
              Tìm kiếm
            </button>
          </form>
        </section>

        <section aria-busy={loading}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                {search.keyword
                  ? `Kết quả cho “${search.keyword}”`
                  : "Ảnh mới nhất"}
              </h2>
              {data && (
                <p className="mt-2 text-sm text-slate-500">
                  {data.total} ảnh · Tối đa 50 ảnh mỗi trang
                </p>
              )}
            </div>

            <button onClick={reset} className={buttonClass}>
              Xem tất cả ảnh
            </button>
          </div>

          {deleteError && (
            <p role="alert" className="mb-4 text-red-700">
              {deleteError}
            </p>
          )}

          {deleteNotice && (
            <p role="status" className="mb-4 text-slate-600">
              {deleteNotice}
            </p>
          )}

          {deleting && (
            <p role="status" className="mb-4">
              Đang xóa ảnh…
            </p>
          )}

          {loading && (
            <div
              role="status"
              aria-live="polite"
              className="rounded-2xl border border-indigo-200 bg-indigo-50 p-8"
            >
              <div className="flex items-center gap-3">
                <span
                  aria-hidden="true"
                  className="h-5 w-5 animate-spin rounded-full border-2 border-indigo-200 border-t-indigo-600"
                />
                <p className="font-semibold text-indigo-900">
                  {message || "Đang tải…"}
                </p>
              </div>
              <p className="mt-3 text-sm text-indigo-700">
                Nếu đang sinh ảnh, hãy giữ trang mở. Ảnh sẽ tự hiển thị
                khi hoàn thành.
              </p>
            </div>
          )}

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-6"
            >
              <p className="text-red-800">{error}</p>
              <button
                onClick={() => setRetry((value) => value + 1)}
                className={`${buttonClass} mt-4`}
              >
                Thử lại
              </button>
            </div>
          )}

          {!loading && data && (
            <>
              {data.items.length === 0 && (
                <p className="rounded-2xl bg-white p-8 text-slate-600">
                  Kho đang chờ các worker bổ sung ảnh.
                </p>
              )}

              {data.items.length > 0 && (
                <div className="mb-5 flex flex-wrap items-center gap-4">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      disabled={deleting}
                      checked={selected.length === data.items.length}
                      onChange={(event) =>
                        setSelected(
                          event.target.checked
                            ? data.items.map((image) => image.id)
                            : [],
                        )
                      }
                    />
                    Chọn tất cả ảnh trên trang
                  </label>

                  <button
                    className="rounded-xl bg-red-700 px-5 py-3 text-sm font-semibold text-white hover:bg-red-800 disabled:opacity-40"
                    disabled={deleting || selected.length === 0}
                    onClick={() => void removeImages(selected, true)}
                  >
                    Xóa ảnh đã chọn ({selected.length})
                  </button>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {data.items.map((image) => (
                  <article
                    key={image.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm"
                  >
                    <img
                      src={image.url}
                      alt={image.subject}
                      width={512}
                      height={512}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />
                    <div className="p-4">
                      <label className="mb-3 flex items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          disabled={deleting}
                          aria-label={`Chọn ảnh ${image.subject} ${image.workerId}`}
                          checked={selected.includes(image.id)}
                          onChange={(event) =>
                            setSelected((current) =>
                              event.target.checked
                                ? [...current, image.id]
                                : current.filter((id) => id !== image.id),
                            )
                          }
                        />
                        Chọn ảnh
                      </label>
                      <h3 className="break-words text-sm font-semibold">
                        {`${image.subject} ${image.workerId}.png`}
                      </h3>
                      <p className="mt-3 text-xs font-medium text-indigo-600">
                        AI {image.workerId}
                      </p>
                      <time className="mt-2 block text-xs text-slate-400">
                        {new Date(image.createdAt).toLocaleString("vi-VN")}
                      </time>
                      <button
                        className="mt-3 text-sm font-semibold text-red-700 disabled:opacity-40"
                        disabled={deleting}
                        onClick={() => void removeImages([image.id], false)}
                        aria-label={`Xóa ảnh ${image.subject} ${image.workerId}`}
                      >
                        Xóa ảnh
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {data.totalPages > 0 && (
                <div className="my-8 flex items-center justify-center gap-4">
                  <button
                    className={buttonClass}
                    disabled={deleting || search.page <= 1}
                    onClick={() =>
                      setSearch((current) => ({
                        ...current,
                        page: current.page - 1,
                      }))
                    }
                  >
                    ← Trước
                  </button>
                  <span className="text-sm">
                    {data.page} / {data.totalPages}
                  </span>
                  <button
                    className={buttonClass}
                    disabled={deleting || search.page >= data.totalPages}
                    onClick={() =>
                      setSearch((current) => ({
                        ...current,
                        page: current.page + 1,
                      }))
                    }
                  >
                    Sau →
                  </button>
                </div>
              )}
            </>
          )}
        </section>

        <footer className="mt-12 border-t border-slate-200 py-8">
          <h2 className="text-xl font-bold">Đóng góp của các AI</h2>
          <p className="mt-2 text-sm text-slate-500">
            Tổng kho: {stats?.total ?? "…"} ảnh
          </p>
          {statsError && (
            <p role="alert" className="mt-3 text-sm text-red-700">
              {statsError}
            </p>
          )}

          <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {stats?.workers.map((worker) => (
              <div
                key={worker.workerId}
                className="rounded-2xl border border-slate-200 bg-white p-5"
              >
                <p className="text-sm text-slate-500">
                  AI {worker.workerId}
                </p>
                <p className="mt-2 text-3xl font-bold text-indigo-600">
                  {worker.count}
                </p>
              </div>
            ))}
          </div>
        </footer>
      </main>
    </div>
  );
}