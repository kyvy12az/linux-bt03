import express from "express";
import cors from "cors";
import "dotenv/config";
import { mockImages } from "./data/mock-images.js";

const app = express();
const port = Number(process.env.PORT ?? 8000);

app.use(cors({
  origin: "http://localhost:5173",
}));

app.use(express.json({ limit: "16kb" }));

app.get("/health", (_req, res) => {
  res.json({
    status: "ok",
    service: "bt03-backend",
    mode: "demo",
  });
});

// Danh sách ảnh, tìm kiếm và phân trang.
app.get("/api/images", (req, res) => {
  const rawPage = req.query.page ?? "1";
  const rawQuery = req.query.q ?? "";

  if (typeof rawPage !== "string" || typeof rawQuery !== "string") {
    res.status(400).json({ message: "Tham số không hợp lệ." });
    return;
  }

  const page = Number(rawPage);
  const keyword = rawQuery.trim().toLowerCase().replace(/\s+/g, " ");

  if (!Number.isSafeInteger(page) || page < 1 || keyword.length > 120) {
    res.status(400).json({ message: "Trang hoặc từ khóa không hợp lệ." });
    return;
  }

  const pageSize = 50;
  const matches = mockImages.filter((image) =>
    image.subject.includes(keyword)
  );

  const start = (page - 1) * pageSize;

  res.json({
    mode: "demo",
    items: matches.slice(start, start + pageSize),
    page,
    pageSize,
    total: matches.length,
    totalPages: Math.ceil(matches.length / pageSize),
    needsGeneration: keyword.length > 0 && matches.length === 0,
  });
});

// Thống kê toàn bộ kho, không phụ thuộc bộ lọc tìm kiếm.
app.get("/api/stats", (_req, res) => {
  const workers = Array.from({ length: 5 }, (_, index) => {
    const workerId = `${index + 1}.1`;

    return {
      workerId,
      count: mockImages.filter((image) => image.workerId === workerId).length,
    };
  });

  res.json({
    mode: "demo",
    total: mockImages.length,
    workers,
  });
});

// Ảnh minh họa nội bộ, không cần dịch vụ ảnh bên ngoài.
app.get("/api/demo-images/:id.svg", (req, res) => {
  const id = Number(req.params.id);
  const image = mockImages.find((item) => item.id === id);

  if (!image) {
    res.status(404).json({ message: "Ảnh mẫu không tồn tại." });
    return;
  }

  const colors = ["#e0e7ff", "#fce7f3", "#dcfce7", "#ffedd5", "#e0f2fe"];
  const background = colors[(image.memberId - 1) % colors.length];

  res.type("svg").send(`
    <svg xmlns="http://www.w3.org/2000/svg" width="512" height="512">
      <rect width="512" height="512" rx="24" fill="${background}"/>
      <circle cx="256" cy="190" r="85" fill="white" opacity="0.7"/>
      <text x="256" y="205" text-anchor="middle"
        font-family="Arial" font-size="40" fill="#334155">
        ${image.id}
      </text>
      <text x="256" y="340" text-anchor="middle"
        font-family="Arial" font-size="30" fill="#0f172a">
        ${image.subject}
      </text>
      <text x="256" y="390" text-anchor="middle"
        font-family="Arial" font-size="20" fill="#64748b">
        DEMO · AI ${image.workerId}
      </text>
    </svg>
  `);
});

app.listen(port, "0.0.0.0", () => {
  console.log(`Backend: http://localhost:${port}`);
});