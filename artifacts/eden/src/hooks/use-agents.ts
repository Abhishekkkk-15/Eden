import { useMutation, useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";
import type { Citation } from "./use-conversations";

export interface Agent {
  id: number;
  name: string;
  description: string;
  emoji: string;
  prompt: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAgentInput {
  name: string;
  description: string;
  emoji: string;
  prompt: string;
}

export interface UpdateAgentInput {
  name?: string;
  description?: string;
  emoji?: string;
  prompt?: string;
}

export interface RunAgentInput {
  input: string;
  useWorkspaceContext?: boolean;
}

export interface AgentRunResult {
  output: string;
  citations: Citation[];
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function getListAgentsQueryKey() {
  return ["agents"] as const;
}

async function fetchAgents(): Promise<Agent[]> {
  const res = await fetch(`${API_BASE_URL}/agents`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch agents");
  return res.json();
}

async function createAgentRequest(data: CreateAgentInput): Promise<Agent> {
  const res = await fetch(`${API_BASE_URL}/agents`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create agent");
  return res.json();
}

async function updateAgentRequest(id: number, data: UpdateAgentInput): Promise<Agent> {
  const res = await fetch(`${API_BASE_URL}/agents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update agent");
  return res.json();
}

async function deleteAgentRequest(id: number): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/agents/${id}`, {
    method: "DELETE",
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error("Failed to delete agent");
}

async function runAgentRequest(id: number, data: RunAgentInput): Promise<AgentRunResult> {
  const res = await fetch(`${API_BASE_URL}/agents/${id}/run`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to run agent");
  return res.json();
}

export function useListAgents() {
  return useQuery({ queryKey: getListAgentsQueryKey(), queryFn: fetchAgents });
}

export function useCreateAgent() {
  return useMutation({
    mutationFn: ({ data }: { data: CreateAgentInput }) => createAgentRequest(data),
  });
}

export function useUpdateAgent() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: UpdateAgentInput }) =>
      updateAgentRequest(id, data),
  });
}

export function useDeleteAgent() {
  return useMutation({
    mutationFn: ({ id }: { id: number }) => deleteAgentRequest(id),
  });
}

export function useRunAgent() {
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: RunAgentInput }) => runAgentRequest(id, data),
  });
}
