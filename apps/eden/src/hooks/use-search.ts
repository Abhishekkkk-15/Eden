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
  score: number;
}

export interface SearchWorkspaceParams {
  q: string;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function getSearchWorkspaceQueryKey(params: SearchWorkspaceParams) {
  return ["search", params.q] as const;
}

async function searchWorkspaceRequest(params: SearchWorkspaceParams): Promise<SearchResult[]> {
  const res = await fetch(`${API_BASE_URL}/search?q=${encodeURIComponent(params.q)}`, {
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
