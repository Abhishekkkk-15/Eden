import { useMutation, useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";
import type { Block } from "./use-blocks";

export type PageKind = "page" | "folder";

export interface Page {
  id: number;
  kind: PageKind;
  title: string;
  emoji: string | null;
  parentId: number | null;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export type PageWithBlocks = Page & { blocks: Block[] };

export interface CreatePageInput {
  kind?: PageKind;
  title: string;
  emoji?: string | null;
  parentId?: number | null;
}

export interface UpdatePageInput {
  kind?: PageKind;
  title?: string;
  emoji?: string | null;
  parentId?: number | null;
  position?: number;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function getListPagesQueryKey() {
  return ["pages"] as const;
}

export function getGetPageQueryKey(id: number) {
  return ["page", id] as const;
}

async function fetchPages(): Promise<Page[]> {
  const res = await fetch(`${API_BASE_URL}/pages`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch pages");
  return res.json();
}

async function fetchPage(id: number): Promise<PageWithBlocks> {
  const res = await fetch(`${API_BASE_URL}/pages/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch page");
  return res.json();
}

async function createPageRequest(data: CreatePageInput): Promise<Page> {
  const res = await fetch(`${API_BASE_URL}/pages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create page");
  return res.json();
}

async function updatePageRequest(id: number, data: UpdatePageInput): Promise<Page> {
  const res = await fetch(`${API_BASE_URL}/pages/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update page");
  return res.json();
}

async function deletePageRequest(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/pages/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete page");
}

export function useListPages() {
  return useQuery({ queryKey: getListPagesQueryKey(), queryFn: fetchPages });
}

export function useGetPage(id: number) {
  return useQuery({
    queryKey: getGetPageQueryKey(id),
    queryFn: () => fetchPage(id),
    enabled: !!id,
  });
}

export function useCreatePage() {
  return useMutation({
    mutationFn: ({ data }: { data: CreatePageInput }) => createPageRequest(data),
  });
}

export function useUpdatePage() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdatePageInput }) =>
      updatePageRequest(id, data),
  });
}

export function useDeletePage() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => deletePageRequest(id),
  });
}
