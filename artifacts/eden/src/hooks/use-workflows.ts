import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";

export interface Workflow {
  id: number;
  name: string;
  description: string;
  emoji: string;
  triggerType: "source_created" | "source_updated" | "scheduled" | "manual";
  triggerConfig: Record<string, unknown>;
  actions: Array<{ type: string; config: Record<string, unknown> }>;
  isActive: boolean;
  runCount: number;
  lastRunAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface WorkflowRun {
  id: number;
  workflowId: number;
  triggerSourceId: number | null;
  triggerData: Record<string, unknown>;
  status: "running" | "completed" | "failed" | "cancelled";
  startedAt: string;
  completedAt: string | null;
  actionResults: Array<{ actionIndex: number; status: string; output?: unknown; error?: string }>;
  errorMessage: string | null;
}

// GET /workflows
async function fetchWorkflows(): Promise<Workflow[]> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/workflows`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch workflows");
  return res.json();
}

// POST /workflows
async function createWorkflow(data: Omit<Workflow, "id" | "runCount" | "createdAt" | "updatedAt" | "lastRunAt">): Promise<Workflow> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/workflows`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create workflow");
  return res.json();
}

// PUT /workflows/:id
async function updateWorkflow(id: number, data: Partial<Workflow>): Promise<Workflow> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/workflows/${id}`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update workflow");
  return res.json();
}

// DELETE /workflows/:id
async function deleteWorkflow(id: number): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/workflows/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete workflow");
}

// POST /workflows/:id/run
async function runWorkflow(id: number): Promise<{ runId: number; status: string }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/workflows/${id}/run`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to run workflow");
  return res.json();
}

// GET /workflows/:id/runs
async function fetchWorkflowRuns(id: number): Promise<WorkflowRun[]> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/workflows/${id}/runs`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch workflow runs");
  return res.json();
}

// React Query hooks
export function useWorkflows() {
  return useQuery({
    queryKey: ["workflows"],
    queryFn: fetchWorkflows,
  });
}

export function useCreateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useUpdateWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<Workflow> }) => updateWorkflow(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useRunWorkflow() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: runWorkflow,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["workflows"] });
    },
  });
}

export function useWorkflowRuns(workflowId: number | null) {
  return useQuery({
    queryKey: ["workflowRuns", workflowId],
    queryFn: () => fetchWorkflowRuns(workflowId!),
    enabled: workflowId !== null,
  });
}
