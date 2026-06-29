import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";

export type SourceKind = "text" | "url" | "youtube" | "image" | "video" | "audio";

export type SourceStatus = "processing" | "ready" | "error";

export interface Source {
  id: number;
  kind: SourceKind;
  title: string;
  url: string | null;
  parentPageId: number | null;
  mediaUrl: string | null;
  embedUrl: string | null;
  mediaMimeType: string | null;
  mediaSizeBytes: number | null;
  summary: string | null;
  chunkCount: number;
  status: SourceStatus;
  createdAt: string;
}

export interface SourceChunk {
  id: number;
  sourceId: number;
  position: number;
  content: string;
}

export type SourceWithChunks = Source & { content: string; chunks: SourceChunk[] };

export interface CreateSourceInput {
  kind: SourceKind;
  title: string;
  content?: string | null;
  url?: string | null;
  parentPageId?: number | null;
  mediaUrl?: string | null;
  originalFilename?: string | null;
  mediaMimeType?: string | null;
  mediaSizeBytes?: number | null;
}

export interface UpdateSourceInput {
  title?: string;
  parentPageId?: number | null;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function getListSourcesQueryKey() {
  return ["sources"] as const;
}

export function getGetSourceQueryKey(id: number) {
  return ["source", id] as const;
}

async function fetchSources(): Promise<Source[]> {
  const res = await fetch(`${API_BASE_URL}/sources`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch sources");
  return res.json();
}

export interface SourcePageResult {
  items: (Source & { isPage?: boolean; tags?: string[] })[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

async function fetchSourcesInFolder(
  parentId: number | null,
  page: number,
  limit: number,
): Promise<SourcePageResult> {
  const params = new URLSearchParams({
    parentId: parentId == null ? "null" : String(parentId),
    page: String(page),
    limit: String(limit),
  });
  const res = await fetch(`${API_BASE_URL}/sources?${params}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch sources");
  return res.json();
}

export function getListSourcesInFolderQueryKey(parentId: number | null, page: number, limit: number) {
  return ["sources", "folder", parentId, page, limit] as const;
}

export function useListSourcesInFolder(parentId: number | null, page = 1, limit = 20) {
  return useQuery({
    queryKey: getListSourcesInFolderQueryKey(parentId, page, limit),
    queryFn: () => fetchSourcesInFolder(parentId, page, limit),
    placeholderData: (prev) => prev,
  });
}

async function fetchSource(id: number): Promise<SourceWithChunks> {
  const res = await fetch(`${API_BASE_URL}/sources/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch source");
  return res.json();
}

export async function createSourceRequest(data: CreateSourceInput): Promise<Source> {
  const res = await fetch(`${API_BASE_URL}/sources`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create source");
  return res.json();
}

async function updateSourceRequest(id: number, data: UpdateSourceInput): Promise<Source> {
  const res = await fetch(`${API_BASE_URL}/sources/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update source");
  return res.json();
}

async function deleteSourceRequest(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/sources/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete source");
}

export function useListSources() {
  return useQuery({ queryKey: getListSourcesQueryKey(), queryFn: fetchSources });
}

export function useGetSource(id: number) {
  return useQuery({
    queryKey: getGetSourceQueryKey(id),
    queryFn: () => fetchSource(id),
    enabled: !!id,
  });
}

export function useCreateSource() {
  return useMutation({
    mutationFn: ({ data }: { data: CreateSourceInput }) => createSourceRequest(data),
  });
}

export function useUpdateSource() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateSourceInput }) =>
      updateSourceRequest(id, data),
  });
}

export function useDeleteSource() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => deleteSourceRequest(id),
  });
}

export function useBulkTagSources() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ ids, tags }: { ids: number[]; tags: string[] }) => {
      const token = localStorage.getItem("token");
      const res = await fetch(`${API_BASE_URL}/sources/bulk/tags`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ ids, tags }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Failed to bulk tag sources");
      }

      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListSourcesQueryKey() });
    },
  });
}
