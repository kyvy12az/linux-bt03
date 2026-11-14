import express from "express";
import cors from "cors";
import "dotenv/config";

const app = express();
const port = Number(process.env.PORT ?? 8000);

const storageUrl = (
  process.env.ID2_BASE_URL ?? "http://100.96.99.43:8000"
).replace(/\/$/, "");

app.use(cors({ origin: "http://localhost:5173" }));
app.use(express.json({ limit: "16kb" }));

async function storageFetch(path: string) {
  const headers: Record<string, string> = {};

  if (process.env.ID2_API_KEY) {
    headers["X-API-Key"] = process.env.ID2_API_KEY;
  }

  const response = await fetch(`${storageUrl}${path}`, {
    headers,
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`Kho ảnh trả HTTP ${response.status}`);
  }

  return response;
}

function reportError(res: express.Response, error: unknown) {
  console.error(
    "[ID2]",
    error instanceof Error ? error.message : "Storage request failed",
  );

  res.status(502).json({
    message: "Không kết nối được kho ảnh. Vui lòng thử lại.",
  });
}

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "bt03-backend",
    mode: "remote",
  });
});

app.get("/api/images", async (req, res) => {
  const rawPage = req.query.page ?? "1";
  const rawQuery = req.query.q ?? "";

  if (typeof rawPage !== "string" || typeof rawQuery !== "string") {
    res.status(400).json({ message: "Tham số không hợp lệ." });
    return;
  }

  const page = Number(rawPage);

  if (!Number.isSafeInteger(page) || page < 1 || rawQuery.length > 120) {
    res.status(400).json({ message: "Trang hoặc từ khóa không hợp lệ." });
    return;
  }

  const params = new URLSearchParams({
    page: String(page),
    pageSize: "50",
    q: rawQuery.trim(),
  });

  try {
    const response = await storageFetch(`/api/v1/images?${params}`);
    const result = await response.json();

    // Đổi đường dẫn ảnh thành đường dẫn trên website ID1.
    const items = result.items.map(
      (image: {
        id: string | number;
        [key: string]: unknown;
      }) => ({
        ...image,
        id: String(image.id),
        url: `/api/images/${encodeURIComponent(String(image.id))}/file`,
      }),
    );

    res.setHeader("Cache-Control", "no-store");
    res.json({
      mode: "remote",
      items,
      page: result.page,
      pageSize: result.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / result.pageSize),
      needsGeneration: rawQuery.trim().length > 0 && result.total === 0,
    });
  } catch (error) {
    reportError(res, error);
  }
});

app.get("/api/images/:id/file", async (req, res) => {
  const id = req.params.id;

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ message: "ID ảnh không hợp lệ." });
    return;
  }

  try {
    const response = await storageFetch(
      `/api/v1/images/${encodeURIComponent(id)}/file`,
    );

    const contentType = (
      response.headers.get("content-type") ?? ""
    ).split(";")[0];

    if (!["image/png", "image/jpeg"].includes(contentType)) {
      throw new Error("Kho trả dữ liệu không phải PNG/JPEG.");
    }

    const buffer = Buffer.from(await response.arrayBuffer());

    res.setHeader("Content-Type", contentType);
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-cache");
    res.send(buffer);
  } catch (error) {
    reportError(res, error);
  }
});

app.get("/api/stats", async (_req, res) => {
  try {
    const response = await storageFetch("/api/v1/stats");
    const result = await response.json();

    const counts: Record<string, number> = {};

    if (Array.isArray(result.workers)) {
      for (const worker of result.workers) {
        counts[String(worker.workerId)] = Number(worker.count);
      }
    } else {
      for (const [workerId, count] of Object.entries(result.workers ?? {})) {
        counts[workerId] = Number(count);
      }
    }

    // Luôn hiển thị 5 worker chính, kể cả chưa có ảnh.
    const workerIds = new Set([
      "1.1", "2.1", "3.1", "4.1", "5.1",
      ...Object.keys(counts),
    ]);

    res.setHeader("Cache-Control", "no-store");
    res.json({
      mode: "remote",
      total: result.total,
      workers: [...workerIds].sort().map((workerId) => ({
        workerId,
        count: counts[workerId] ?? 0,
      })),
    });
  } catch (error) {
    reportError(res, error);
  }
});

const dispatcherUrl = (
  process.env.DISPATCHER_BASE_URL ?? "http://100.86.246.4:8003"
).replace(/\/$/, "");

async function dispatcherFetch(
  path: string,
  method: "GET" | "POST",
  body?: unknown,
) {
  const response = await fetch(`${dispatcherUrl}${path}`, {
    method,
    headers: {
      Accept: "application/json",
      ...(body === undefined
        ? {}
        : { "Content-Type": "application/json" }),
    },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });

  if (!response.ok) {
    throw new Error(`ID3 trả HTTP ${response.status}`);
  }

  return response.json();
}

app.post("/api/search", async (req, res) => {
  const query = req.body?.query;

  if (
    typeof query !== "string" ||
    !query.trim() ||
    query.length > 120
  ) {
    res.status(400).json({ message: "Từ khóa không hợp lệ." });
    return;
  }

  try {
    const result = await dispatcherFetch(
      "/api/v1/search",
      "POST",
      {
        query,
        style: "mondrian-geometric",
      },
    );

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    console.error("[ID3 search]", error);
    res.status(502).json({
      message: "Chưa kết nối được bộ điều phối. Vui lòng thử lại.",
    });
  }
});

app.get("/api/jobs/:jobId", async (req, res) => {
  const jobId = req.params.jobId;

  if (!/^[a-zA-Z0-9_-]+$/.test(jobId)) {
    res.status(400).json({ message: "Mã nhiệm vụ không hợp lệ." });
    return;
  }

  try {
    const result = await dispatcherFetch(
      `/api/v1/jobs/${encodeURIComponent(jobId)}`,
      "GET",
    );

    res.setHeader("Cache-Control", "no-store");
    res.json(result);
  } catch (error) {
    console.error("[ID3 job]", error);
    res.status(502).json({
      message: "Không đọc được trạng thái sinh ảnh.",
    });
  }
});

// Thông tin ảnh sau khi nhiệm vụ hoàn thành.
app.get("/api/images/:id", async (req, res) => {
  const id = req.params.id;

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({ message: "ID ảnh không hợp lệ." });
    return;
  }

  try {
    const response = await storageFetch(
      `/api/v1/images/${encodeURIComponent(id)}`,
    );

    const image = await response.json();

    res.setHeader("Cache-Control", "no-store");
    res.json({
      ...image,
      id: String(image.id),
      url: `/api/images/${encodeURIComponent(String(image.id))}/file`,
    });
  } catch (error) {
    reportError(res, error);
  }
});

async function deleteFromStorage(
  res: express.Response,
  path: string,
  method: "DELETE" | "POST",
  body?: unknown,
) {
  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
    };

    if (process.env.ID2_API_KEY) {
      headers["X-API-Key"] = process.env.ID2_API_KEY;
    }

    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await fetch(`${storageUrl}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });

    res.setHeader("Cache-Control", "no-store");

    const contentType = response.headers.get("content-type");
    if (contentType) {
      res.setHeader("Content-Type", contentType);
    }

    // Giữ nguyên status và body từ ID2, hỗ trợ cả 204.
    res.status(response.status).send(await response.text());
  } catch (error) {
    reportError(res, error);
  }
}

// Xóa nhiều ảnh.
app.post("/api/images/bulk-delete", async (req, res) => {
  const ids: unknown = req.body?.image_ids;

  if (
    !Array.isArray(ids) ||
    ids.length === 0 ||
    ids.length > 50 ||
    !ids.every(
      (id) =>
        typeof id === "string" &&
        /^[a-zA-Z0-9_-]+$/.test(id),
    )
  ) {
    res.status(400).json({
      message: "Cần chọn từ 1 đến 50 ID ảnh hợp lệ.",
    });
    return;
  }

  await deleteFromStorage(
    res,
    "/api/v1/images/bulk-delete",
    "POST",
    { image_ids: [...new Set(ids)] },
  );
});

// Xóa một ảnh.
app.delete("/api/images/:id", async (req, res) => {
  const id = req.params.id;

  if (!/^[a-zA-Z0-9_-]+$/.test(id)) {
    res.status(400).json({
      message: "ID ảnh không hợp lệ.",
    });
    return;
  }

  await deleteFromStorage(
    res,
    `/api/v1/images/${encodeURIComponent(id)}`,
    "DELETE",
  );
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend: http://localhost:${port}`);
  console.log(`Storage: ${storageUrl}`);
});