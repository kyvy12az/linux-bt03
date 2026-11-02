export interface GalleryImage {
  id: number;
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