export interface GalleryImage {
  id: string;
  name: string;
  subject: string;
  memberId: number;
  workerId: string;
  model: string;
  url: string;
  createdAt: string;
}

export interface ImagesResponse {
  mode: string;
  items: GalleryImage[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  needsGeneration: boolean;
}

export interface StatsResponse {
  mode: string;
  total: number;
  workers: {
    workerId: string;
    count: number;
  }[];
}

export interface SearchResponse {
  status: "queued" | "running" | "completed" | "failed";
  foundInStore: boolean;
  subject: string;
  style: string;
  jobId?: string;
  image?: GalleryImage;
}

export interface JobResponse {
  jobId: string;
  status: "queued" | "running" | "completed" | "failed";
  subject: string;
  workerId: string;
  imageId: string;
  error: string;
}

async function request<T>(
  path: string,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, { signal });

  if (!response.ok) {
    throw new Error(`Không tải được dữ liệu (HTTP ${response.status}).`);
  }

  return response.json() as Promise<T>;
}

export function getImages(
  page: number,
  keyword: string,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({
    page: String(page),
    q: keyword,
  });

  return request<ImagesResponse>(`/api/images?${params}`, signal);
}

export function getStats(signal?: AbortSignal) {
  return request<StatsResponse>("/api/stats", signal);
}

export async function searchImages(
  query: string,
  signal?: AbortSignal,
): Promise<SearchResponse> {
  const response = await fetch("/api/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    signal,
  });

  if (!response.ok) {
    throw new Error("Không gửi được yêu cầu tìm kiếm tới bộ điều phối.");
  }

  return response.json() as Promise<SearchResponse>;
}

export function getJob(jobId: string, signal?: AbortSignal) {
  return request<JobResponse>(
    `/api/jobs/${encodeURIComponent(jobId)}`,
    signal,
  );
}

export function getImage(id: string, signal?: AbortSignal) {
  return request<GalleryImage>(
    `/api/images/${encodeURIComponent(id)}`,
    signal,
  );
}

export async function deleteImages(
  ids: string[],
  bulk: boolean,
): Promise<void> {
  const response = await fetch(
    bulk
      ? "/api/images/bulk-delete"
      : `/api/images/${encodeURIComponent(ids[0])}`,
    bulk
      ? {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ image_ids: ids }),
        }
      : {
          method: "DELETE",
        },
  );

  if (!response.ok) {
    throw new Error(
      `Không xóa được ảnh (HTTP ${response.status}). ` +
        "Vui lòng tải lại kho trước khi thử lại.",
    );
  }

  // Không gọi response.json(): ID2 có thể trả 204.
}