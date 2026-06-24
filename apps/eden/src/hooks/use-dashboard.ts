import { useQuery } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";

export interface DashboardSummary {
  pageCount: number;
  sourceCount: number;
  agentCount: number;
  conversationCount: number;
  messageCount: number;
}

export type RecentActivityItemKind = "page" | "source" | "conversation";

export interface RecentActivityItem {
  kind: RecentActivityItemKind;
  refId: number;
  title: string;
  subtitle: string | null;
  updatedAt: string;
}

function authHeaders(): HeadersInit {
  return { Authorization: `Bearer ${localStorage.getItem("token")}` };
}

export function getGetDashboardSummaryQueryKey() {
  return ["dashboardSummary"] as const;
}

export function getGetRecentActivityQueryKey() {
  return ["recentActivity"] as const;
}

async function fetchDashboardSummary(): Promise<DashboardSummary> {
  const res = await fetch(`${API_BASE_URL}/dashboard/summary`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch dashboard summary");
  return res.json();
}

async function fetchRecentActivity(): Promise<RecentActivityItem[]> {
  const res = await fetch(`${API_BASE_URL}/dashboard/recent`, { headers: authHeaders() });
  if (!res.ok) throw new Error("Failed to fetch recent activity");
  return res.json();
}

export function useGetDashboardSummary() {
  return useQuery({ queryKey: getGetDashboardSummaryQueryKey(), queryFn: fetchDashboardSummary });
}

export function useGetRecentActivity() {
  return useQuery({ queryKey: getGetRecentActivityQueryKey(), queryFn: fetchRecentActivity });
}
