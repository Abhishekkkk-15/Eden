import { useMutation, useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";

export interface Conversation {
  id: number;
  title: string;
  agentId: number | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
}

export type MessageRole = "user" | "assistant" | "system";

export type CitationKind = "page" | "source";

export interface Citation {
  kind: CitationKind;
  refId: number;
  title: string;
  snippet: string;
}

export type ChatContextItemType = "source" | "page" | "folder";

export interface ChatContextItem {
  type: ChatContextItemType;
  id: number;
  title?: string;
}

export interface Message {
  id: number;
  conversationId: number;
  role: MessageRole;
  content: string;
  citations: Citation[];
  contextItems: ChatContextItem[];
  createdAt: string;
}

export type ConversationWithMessages = Conversation & { messages: Message[] };

export interface CreateConversationInput {
  title: string;
  agentId?: number | null;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function getListConversationsQueryKey() {
  return ["conversations"] as const;
}

export function getGetConversationQueryKey(id: number) {
  return ["conversation", id] as const;
}

async function fetchConversations(): Promise<Conversation[]> {
  const res = await fetch(`${API_BASE_URL}/conversations`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch conversations");
  return res.json();
}

async function fetchConversation(id: number): Promise<ConversationWithMessages> {
  const res = await fetch(`${API_BASE_URL}/conversations/${id}`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch conversation");
  return res.json();
}

async function createConversationRequest(data: CreateConversationInput): Promise<Conversation> {
  const res = await fetch(`${API_BASE_URL}/conversations`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create conversation");
  return res.json();
}

async function deleteConversationRequest(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/conversations/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete conversation");
}

export function useListConversations() {
  return useQuery({ queryKey: getListConversationsQueryKey(), queryFn: fetchConversations });
}

export function useGetConversation(id: number) {
  return useQuery({
    queryKey: getGetConversationQueryKey(id),
    queryFn: () => fetchConversation(id),
    enabled: !!id,
  });
}

export function useCreateConversation() {
  return useMutation({
    mutationFn: ({ data }: { data: CreateConversationInput }) => createConversationRequest(data),
  });
}

export function useDeleteConversation() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => deleteConversationRequest(id),
  });
}
