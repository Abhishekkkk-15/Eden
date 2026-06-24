import { useMutation } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";

export type BlockType =
  | "text"
  | "heading1"
  | "heading2"
  | "heading3"
  | "todo"
  | "bulleted"
  | "numbered"
  | "quote"
  | "code"
  | "divider";

export interface Block {
  id: number;
  pageId: number;
  type: BlockType;
  content: string;
  checked: boolean;
  position: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateBlockInput {
  type: BlockType;
  content: string;
  checked?: boolean;
  position?: number;
}

export interface UpdateBlockInput {
  type?: BlockType;
  content?: string;
  checked?: boolean;
  position?: number;
}

export interface ReorderBlocksInput {
  orderedIds: number[];
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

async function createBlockRequest(pageId: number, data: CreateBlockInput): Promise<Block> {
  const res = await fetch(`${API_BASE_URL}/pages/${pageId}/blocks`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create block");
  return res.json();
}

async function updateBlockRequest(id: number, data: UpdateBlockInput): Promise<Block> {
  const res = await fetch(`${API_BASE_URL}/blocks/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update block");
  return res.json();
}

async function deleteBlockRequest(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/blocks/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete block");
}

async function reorderBlocksRequest(pageId: number, data: ReorderBlocksInput): Promise<Block[]> {
  const res = await fetch(`${API_BASE_URL}/pages/${pageId}/blocks/reorder`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to reorder blocks");
  return res.json();
}

export function useCreateBlock() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: CreateBlockInput }) =>
      createBlockRequest(id, data),
  });
}

export function useUpdateBlock() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateBlockInput }) =>
      updateBlockRequest(id, data),
  });
}

export function useDeleteBlock() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => deleteBlockRequest(id),
  });
}

export function useReorderBlocks() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: ReorderBlocksInput }) =>
      reorderBlocksRequest(id, data),
  });
}
