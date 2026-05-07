import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { API_BASE_URL } from "@/config";
export interface CloudIntegration {
  id: number;
  provider: "google_drive" | "dropbox" | "one_drive";
  providerAccountEmail: string | null;
  isActive: boolean;
  lastSyncedAt: string | null;
  syncError: string | null;
  createdAt: string;
}

export interface CloudFile {
  id: string;
  name: string;
  type: "file" | "folder";
  path?: string;
  mimeType?: string;
  size?: number;
  modifiedAt?: string;
}

export interface ImportQueueItem {
  id: number;
  integrationId: number;
  provider: string;
  providerFileName: string;
  providerFilePath: string | null;
  status: "pending" | "downloading" | "processing" | "completed" | "failed";
  errorMessage: string | null;
  sourceId: number | null;
  createdAt: string;
  updatedAt: string;
}

// GET /cloud/integrations - List user's cloud integrations
async function fetchCloudIntegrations(): Promise<CloudIntegration[]> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch cloud integrations");
  return res.json();
}

// GET /cloud/google/auth - Get Google Drive OAuth URL
async function getGoogleDriveAuthUrl(): Promise<{ authUrl: string }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/google/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to get Google Drive auth URL");
  return res.json();
}

// GET /cloud/dropbox/auth - Get Dropbox OAuth URL
async function getDropboxAuthUrl(): Promise<{ authUrl: string }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/dropbox/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to get Dropbox auth URL");
  return res.json();
}

// DELETE /cloud/integrations/:id - Disconnect integration
async function deleteCloudIntegration(id: number): Promise<void> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete integration");
}

// POST /cloud/integrations/:id/sync - Trigger sync
async function syncCloudIntegration(id: number): Promise<{ success: boolean; message: string }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${id}/sync`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to sync integration");
  return res.json();
}

// GET /cloud/integrations/:id/files - List files
async function fetchCloudFiles(integrationId: number, path?: string): Promise<{ files: CloudFile[]; path: string }> {
  const token = localStorage.getItem("token");
  const url = new URL(`${API_BASE_URL}/cloud/integrations/${integrationId}/files`);
  if (path) url.searchParams.set("path", path);
  
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch cloud files");
  return res.json();
}

// POST /cloud/integrations/:id/import - Queue file for import
async function importCloudFile(
  integrationId: number,
  data: {
    fileId: string;
    fileName: string;
    filePath?: string;
    mimeType?: string;
    fileSize?: number;
    targetPageId?: number;
    indexOnly?: boolean;
  }
): Promise<{ success: boolean; queueItem: { id: number } }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/import`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to queue import");
  return res.json();
}

// GET /cloud/import-queue - Get import queue
async function fetchImportQueue(status?: string): Promise<ImportQueueItem[]> {
  const token = localStorage.getItem("token");
  const url = new URL(`${API_BASE_URL}/cloud/import-queue`);
  if (status) url.searchParams.set("status", status);
  
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to fetch import queue");
  return res.json();
}

// POST /cloud/integrations/:id/export - Export Eden source to cloud
async function exportCloudFile(
  integrationId: number,
  data: {
    sourceId: number;
    targetFolderId?: string;
    isPage?: boolean;
  }
): Promise<{ success: boolean; providerFileId: string }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to export to cloud");
  return res.json();
}

// PATCH /cloud/integrations/:id - Update integration settings
async function updateCloudIntegrationSettings(
  id: number,
  data: { isActive?: boolean; syncSettings?: Record<string, any> }
): Promise<CloudIntegration> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${id}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update integration settings");
  return res.json();
}

// React Query hooks
export function useCloudIntegrations() {
  return useQuery({
    queryKey: ["cloud-integrations"],
    queryFn: fetchCloudIntegrations,
  });
}

export function useConnectGoogleDrive() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: getGoogleDriveAuthUrl,
    onSuccess: (data) => {
      // Open OAuth popup or redirect
      window.location.href = data.authUrl;
    },
  });
}

export function useConnectDropbox() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: getDropboxAuthUrl,
    onSuccess: (data) => {
      // Open OAuth popup or redirect
      window.location.href = data.authUrl;
    },
  });
}

export function useDeleteCloudIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: deleteCloudIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cloud-integrations"] });
    },
  });
}

export function useSyncCloudIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: syncCloudIntegration,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["cloud-integrations"] });
    },
  });
}

export function useCloudFiles(integrationId: number | null, path?: string) {
  return useQuery({
    queryKey: ["cloud-files", integrationId, path],
    queryFn: () => fetchCloudFiles(integrationId!, path),
    enabled: integrationId !== null,
  });
}

export function useImportCloudFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ integrationId, data }: { integrationId: number; data: Parameters<typeof importCloudFile>[1] }) =>
      importCloudFile(integrationId, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["import-queue"] });
      queryClient.invalidateQueries({ queryKey: ["sources"] });
    },
  });
}

export function useImportQueue(status?: string) {
  return useQuery({
    queryKey: ["import-queue", status],
    queryFn: () => fetchImportQueue(status),
  });
}

export function useExportCloudFile() {
  return useMutation({
    mutationFn: ({ integrationId, data }: { integrationId: number; data: Parameters<typeof exportCloudFile>[1] }) =>
      exportCloudFile(integrationId, data),
  });
}

// ============== CRUD OPERATIONS ==============

// POST /cloud/integrations/:id/folders - Create folder
async function createCloudFolder(
  integrationId: number,
  data: { name: string; parentId?: string }
): Promise<{ id: string; name: string; type: "folder" }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/folders`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create folder");
  return res.json();
}

// PATCH /cloud/integrations/:id/files/:fileId - Rename or move file
async function updateCloudFile(
  integrationId: number,
  fileId: string,
  data: { name?: string; parentId?: string; removeParents?: string[] }
): Promise<{ id: string; name: string; type: "file" | "folder" }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/files/${fileId}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to update file");
  return res.json();
}

// DELETE /cloud/integrations/:id/files/:fileId - Delete file/folder
async function deleteCloudFile(integrationId: number, fileId: string): Promise<{ success: boolean }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/files/${fileId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to delete file");
  return res.json();
}

// GET /cloud/integrations/:id/files/:fileId/content - Download file
async function downloadCloudFile(integrationId: number, fileId: string): Promise<Blob> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/files/${fileId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error("Failed to download file");
  return res.blob();
}

// ============== AI OPERATIONS ==============

// POST /cloud/integrations/:id/files/:fileId/ai-analyze
async function analyzeCloudFile(
  integrationId: number,
  fileId: string,
  data: { prompt?: string; maxTokens?: number }
): Promise<{ fileId: string; fileName: string; analysis: string; contentLength: number }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/files/${fileId}/ai-analyze`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to analyze file");
  return res.json();
}

// POST /cloud/integrations/:id/ai-create-document
async function createAIDocument(
  integrationId: number,
  data: {
    prompt: string;
    title: string;
    parentId?: string;
    type?: "document" | "notes" | "report";
  }
): Promise<{ id: string; name: string; type: string; content: string; message: string }> {
  const token = localStorage.getItem("token");
  const res = await fetch(`${API_BASE_URL}/cloud/integrations/${integrationId}/ai-create-document`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) throw new Error("Failed to create AI document");
  return res.json();
}

// ============== REACT QUERY HOOKS FOR CRUD ==============

export function useCreateCloudFolder() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ integrationId, data }: { integrationId: number; data: Parameters<typeof createCloudFolder>[1] }) =>
      createCloudFolder(integrationId, data),
    onSuccess: (_, { integrationId }) => {
      queryClient.invalidateQueries({ queryKey: ["cloud-files", integrationId] });
    },
  });
}

export function useUpdateCloudFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ integrationId, fileId, data }: { integrationId: number; fileId: string; data: Parameters<typeof updateCloudFile>[2] }) =>
      updateCloudFile(integrationId, fileId, data),
    onSuccess: (_, { integrationId }) => {
      queryClient.invalidateQueries({ queryKey: ["cloud-files", integrationId] });
    },
  });
}

export function useDeleteCloudFile() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ integrationId, fileId }: { integrationId: number; fileId: string }) =>
      deleteCloudFile(integrationId, fileId),
    onSuccess: (_, { integrationId }) => {
      queryClient.invalidateQueries({ queryKey: ["cloud-files", integrationId] });
    },
  });
}

export function useDownloadCloudFile() {
  return useMutation({
    mutationFn: ({ integrationId, fileId }: { integrationId: number; fileId: string }) =>
      downloadCloudFile(integrationId, fileId),
  });
}

export function useAnalyzeCloudFile() {
  return useMutation({
    mutationFn: ({ integrationId, fileId, data }: { integrationId: number; fileId: string; data?: { prompt?: string; maxTokens?: number } }) =>
      analyzeCloudFile(integrationId, fileId, data || {}),
  });
}

export function useCreateAIDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ integrationId, data }: { integrationId: number; data: Parameters<typeof createAIDocument>[1] }) =>
      createAIDocument(integrationId, data),
    onSuccess: (_, { integrationId }) => {
      queryClient.invalidateQueries({ queryKey: ["cloud-files", integrationId] });
    },
  });
}

export function useUpdateCloudIntegration() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: number; data: { isActive?: boolean; syncSettings?: Record<string, any> } }) =>
      updateCloudIntegrationSettings(id, data),
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["cloud-integrations"] });
      queryClient.invalidateQueries({ queryKey: ["cloud-files", id] });
    },
  });
}
