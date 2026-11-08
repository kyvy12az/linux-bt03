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

    const counts = result.workers as Record<string, number>;

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

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend: http://localhost:${port}`);
  console.log(`Storage: ${storageUrl}`);
});