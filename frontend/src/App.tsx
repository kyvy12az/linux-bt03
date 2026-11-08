import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { getImages, getStats } from "./api";
import type { ImagesResponse, StatsResponse } from "./api";

const suggestions = ["black dog", "red hat", "green apple", "blue butterfly"];

const buttonStyle =
  "rounded-xl border border-slate-200 bg-white px-5 py-3 text-sm " +
  "font-semibold transition hover:bg-slate-100 " +
  "disabled:opacity-40";

export default function App() {
  const [input, setInput] = useState("");
  const [search, setSearch] = useState({ keyword: "", page: 1 });
  const [data, setData] = useState<ImagesResponse | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [statsError, setStatsError] = useState("");
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setError("");
      setData(null);

      try {
        const result = await getImages(
          search.page,
          search.keyword,
          controller.signal,
        );

        if (!controller.signal.aborted) {
          setData(result);
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          setError(
            err instanceof Error ? err.message : "Đã xảy ra lỗi kết nối.",
          );
        }
      } finally {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [search, retry]);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setStatsError("");

      try {
        const result = await getStats(controller.signal);

        if (!controller.signal.aborted) {
          setStats(result);
        }
      } catch {
        if (!controller.signal.aborted) {
          setStatsError("Không tải được thống kê. Hãy kiểm tra backend.");
        }
      }
    }

    void load();

    return () => controller.abort();
  }, [retry]);

  function runSearch(value: string) {
    const keyword = value.trim().toLowerCase().replace(/\s+/g, " ");
    setInput(keyword);
    setSearch({ keyword, page: 1 });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    runSearch(input);
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-5 py-5">
          <button
            onClick={() => runSearch("")}
            className="text-xl font-extrabold tracking-tight"
            aria-label="Về trang chủ"
          >
            <span className="text-indigo-600">Atlas</span> Gallery
          </button>

          <span className="rounded-full bg-amber-50 px-3 py-2 text-xs font-semibold text-amber-800">
            Kho ảnh AI
          </span>
        </nav>
      </header>

      <main className="mx-auto max-w-7xl px-5">
        <section className="py-12 text-center sm:py-16">
          <p className="mb-4 text-xs font-bold tracking-[0.2em] text-indigo-600">
            KHO ẢNH BÁCH KHOA THÔNG MINH
          </p>

          <h1 className="text-3xl font-extrabold tracking-tight sm:text-5xl">
            Khám phá thế giới qua hình ảnh
          </h1>

          <p className="mx-auto mt-5 max-w-xl leading-7 text-slate-500">
            Tìm kiếm ảnh AI theo tên tiếng Anh, phong cách Mondrian geometric.
          </p>

          <form
            onSubmit={handleSubmit}
            className="mx-auto mt-8 flex max-w-2xl flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-2 shadow-sm sm:flex-row"
            role="search"
          >
            <label htmlFor="search" className="sr-only">
              Từ khóa tìm ảnh bằng tiếng Anh
            </label>

            <input
              id="search"
              type="search"
              value={input}
              onChange={(event) => setInput(event.target.value)}
              maxLength={120}
              placeholder="Ví dụ: black dog, red hat..."
              className="min-w-0 flex-1 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-indigo-300"
            />

            <button
              type="submit"
              className="rounded-xl bg-indigo-600 px-6 py-3 font-semibold text-white transition hover:bg-indigo-700"
            >
              Tìm kiếm
            </button>
          </form>

          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {suggestions.map((word) => (
              <button
                key={word}
                onClick={() => runSearch(word)}
                className="rounded-full border border-slate-200 bg-white px-3 py-1.5 text-xs text-slate-600 hover:border-indigo-300 hover:text-indigo-600"
              >
                {word}
              </button>
            ))}
          </div>
        </section>

        <section aria-label="Kho ảnh" aria-busy={loading}>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-2xl font-bold">
                {search.keyword
                  ? `Kết quả cho “${search.keyword}”`
                  : "Ảnh mới nhất"}
              </h2>

              <p className="mt-2 text-sm text-slate-500" aria-live="polite">
                {loading
                  ? "Đang tải dữ liệu..."
                  : data
                    ? `${data.total} ảnh · Tối đa ${data.pageSize} ảnh mỗi trang`
                    : "Chưa tải được dữ liệu"}
              </p>
            </div>

            {search.keyword && (
              <button
                className={buttonStyle}
                onClick={() => runSearch("")}
              >
                Xem tất cả ảnh
              </button>
            )}
          </div>

          {error && (
            <div
              role="alert"
              className="rounded-2xl border border-red-200 bg-red-50 p-6 text-red-800"
            >
              <p>{error} Kiểm tra backend đang chạy ở cổng 8000.</p>
              <button
                className={`${buttonStyle} mt-4`}
                onClick={() => setRetry((value) => value + 1)}
              >
                Thử lại
              </button>
            </div>
          )}

          {loading && (
            <div
              className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5"
              aria-hidden="true"
            >
              {Array.from({ length: 10 }, (_, index) => (
                <div
                  key={index}
                  className="aspect-square animate-pulse rounded-2xl bg-slate-200"
                />
              ))}
            </div>
          )}

          {!loading && data?.needsGeneration && (
            <div
              role="status"
              className="rounded-2xl border border-amber-200 bg-amber-50 p-8"
            >
              <h3 className="text-lg font-bold text-amber-900">
                Cần tạo ảnh mới cho “{search.keyword}”
              </h3>
              <p className="mt-3 leading-7 text-amber-800">
                Kho hiện chưa có ảnh phù hợp. Chức năng tự sinh theo yêu cầu
                đang chờ kết nối bộ điều phối.
              </p>
            </div>
          )}

          {!loading && data && data.items.length > 0 && (
            <>
              <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-5">
                {data.items.map((image) => (
                  <article
                    key={image.id}
                    className="overflow-hidden rounded-2xl border border-slate-200 bg-white transition hover:-translate-y-1 hover:shadow-lg"
                  >
                    <img
                      src={image.url}
                      alt={`Ảnh ${image.subject} theo phong cách Mondrian geometric`}
                      width={512}
                      height={512}
                      loading="lazy"
                      className="aspect-square w-full object-cover"
                    />

                    <div className="p-4">
                      <h3 className="break-words text-sm font-semibold leading-6">
                        {image.name}
                      </h3>

                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className="rounded-full bg-indigo-50 px-2 py-1 font-medium text-indigo-700">
                          AI {image.workerId}
                        </span>
                        <span className="text-slate-400">
                          #{image.id}
                        </span>
                      </div>

                      <time
                        dateTime={image.createdAt}
                        className="mt-3 block text-xs text-slate-500"
                      >
                        {new Date(image.createdAt).toLocaleString("vi-VN")}
                      </time>
                    </div>
                  </article>
                ))}
              </div>

              <div className="my-8 flex items-center justify-center gap-3">
                <button
                  className={buttonStyle}
                  disabled={search.page <= 1}
                  onClick={() =>
                    setSearch((current) => ({
                      ...current,
                      page: current.page - 1,
                    }))
                  }
                >
                  ← Trước
                </button>

                <span className="text-sm text-slate-600">
                  {data.page} / {data.totalPages}
                </span>

                <button
                  className={buttonStyle}
                  disabled={search.page >= data.totalPages}
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
            </>
          )}
        </section>

        <footer className="mt-12 border-t border-slate-200 py-8">
          <div className="mb-5">
            <h2 className="text-xl font-bold">Đóng góp của các AI</h2>
            <p className="mt-2 text-sm text-slate-500">
              {stats
                ? `Tổng kho: ${stats.total} ảnh · Thống kê toàn bộ kho`
                : "Đang tải thống kê..."}
            </p>
          </div>

          {statsError && (
            <div role="alert" className="mb-4 text-sm text-red-700">
              {statsError}
              <button
                className="ml-3 underline"
                onClick={() => setRetry((value) => value + 1)}
              >
                Thử lại
              </button>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
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
                  <span className="ml-2 text-xs font-normal text-slate-400">
                    ảnh
                  </span>
                </p>
              </div>
            ))}
          </div>

          <p className="mt-7 text-center text-xs leading-6 text-slate-400">
            Atlas Gallery · BT-03 · Mondrian geometric
          </p>
        </footer>
      </main>
    </div>
  );
}