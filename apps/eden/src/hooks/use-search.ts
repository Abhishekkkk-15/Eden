import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";

export type SearchResultKind = "page" | "block" | "source" | "chunk";

export interface SearchResult {
  kind: SearchResultKind;
  refId: number;
  pageId: number | null;
  sourceId: number | null;
  title: string;
  snippet: string;
  content?: string;
  score: number;
}

export interface SearchWorkspaceParams {
  q: string;
  limit?: number;
  mode?: "hybrid" | "semantic" | "fts";
  includeContent?: boolean;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function getSearchWorkspaceQueryKey(params: SearchWorkspaceParams) {
  return ["search", params.q, params.limit, params.mode, params.includeContent] as const;
}

async function searchWorkspaceRequest(params: SearchWorkspaceParams): Promise<SearchResult[]> {
  const query = new URLSearchParams({ q: params.q });
  if (params.limit !== undefined) query.set("limit", String(params.limit));
  if (params.mode !== undefined) query.set("mode", params.mode);
  if (params.includeContent !== undefined) query.set("includeContent", String(params.includeContent));

  const res = await fetch(`${API_BASE_URL}/search?${query.toString()}`, {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to search workspace");
  return res.json();
}

export function useSearchWorkspace(
  params: SearchWorkspaceParams,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: getSearchWorkspaceQueryKey(params),
    queryFn: () => searchWorkspaceRequest(params),
    enabled: options?.enabled ?? true,
  });
}
