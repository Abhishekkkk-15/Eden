import { Router, type IRouter } from "express";
import { db, cloudIntegrationsTable, cloudImportQueueTable, sourcesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { authenticate, verifyToken } from "../lib/auth";

const router: IRouter = Router();

// Helper to get user from Authorization header for OAuth start routes
function getUserFromHeader(req: any) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return null;
  }
  const token = authHeader.slice(7);
  try {
    return verifyToken(token);
  } catch {
    return null;
  }
}

// OAuth Configuration
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || "";
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || "";
const DROPBOX_APP_KEY = process.env.DROPBOX_APP_KEY || "";
const DROPBOX_APP_SECRET = process.env.DROPBOX_APP_SECRET || "";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:3000";

// ============== GOOGLE DRIVE OAUTH ==============

// GET /cloud/google/auth - Start Google Drive OAuth flow
router.get("/cloud/google/auth", async (req, res) => {
  const user = getUserFromHeader(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  
  if (!GOOGLE_CLIENT_ID) {
    return res.status(500).json({ error: "Google Drive not configured" });
  }

  const redirectUri = `${API_URL}/api/cloud/google/callback`;
  const state = Buffer.from(JSON.stringify({ 
    userId: user.id, 
    redirect: `${APP_URL}/settings/integrations?provider=google_drive` 
  })).toString("base64");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
      // Full drive access for CRUD operations
  authUrl.searchParams.set("scope", "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  res.json({ authUrl: authUrl.toString() });
});

// GET /cloud/google/callback - OAuth callback
router.get("/cloud/google/callback", async (req, res) => {
  const { code, state, error } = req.query;
  
  if (error || !code) {
    return res.redirect(`${APP_URL}/settings/integrations?error=auth_failed`);
  }

  try {
    const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
    const redirectUri = `${API_URL}/api/cloud/google/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: code as string,
        client_id: GOOGLE_CLIENT_ID,
        client_secret: GOOGLE_CLIENT_SECRET,
        redirect_uri: redirectUri,
        grant_type: "authorization_code",
      }),
    });

    const tokens = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error("Google token exchange failed:", tokens);
      return res.redirect(`${APP_URL}/settings/integrations?error=token_exchange_failed`);
    }

    // Get user info
    const userInfoResponse = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const userInfo = await userInfoResponse.json();

    // Store integration
    await db.insert(cloudIntegrationsTable).values({
      userId: stateData.userId,
      provider: "google_drive",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      providerAccountEmail: userInfo.email,
      providerAccountId: userInfo.id,
      isActive: true,
      lastSyncedAt: new Date(),
    });

    res.redirect(stateData.redirect + "&status=connected");
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${APP_URL}/settings/integrations?error=callback_failed`);
  }
});

// ============== DROPBOX OAUTH ==============

// GET /cloud/dropbox/auth - Start Dropbox OAuth flow
router.get("/cloud/dropbox/auth", async (req, res) => {
  const user = getUserFromHeader(req);
  if (!user) {
    return res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
  }
  
  if (!DROPBOX_APP_KEY) {
    return res.status(500).json({ error: "Dropbox not configured" });
  }

  const redirectUri = `${API_URL}/api/cloud/dropbox/callback`;
  const state = Buffer.from(JSON.stringify({ 
    userId: user.id, 
    redirect: `${APP_URL}/settings/integrations?provider=dropbox` 
  })).toString("base64");

  const authUrl = new URL("https://www.dropbox.com/oauth2/authorize");
  authUrl.searchParams.set("client_id", DROPBOX_APP_KEY);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  res.json({ authUrl: authUrl.toString() });
});

// GET /cloud/dropbox/callback - OAuth callback (PUBLIC - no auth required)
router.get("/cloud/dropbox/callback", async (req, res) => {
  console.log("[DEBUG] Dropbox callback hit:", req.url);
  const { code, state, error } = req.query;
  
  if (error || !code) {
    console.log("[DEBUG] Missing code or error:", { code: !!code, error });
    return res.redirect(`${APP_URL}/settings/integrations?error=auth_failed`);
  }

  try {
    const stateData = JSON.parse(Buffer.from(state as string, "base64").toString());
    const redirectUri = `${API_URL}/api/cloud/dropbox/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch("https://api.dropboxapi.com/oauth2/token", {
      method: "POST",
      headers: { 
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${DROPBOX_APP_KEY}:${DROPBOX_APP_SECRET}`).toString("base64")}`,
      },
      body: new URLSearchParams({
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenResponse.json();
    
    if (!tokenResponse.ok) {
      console.error("Dropbox token exchange failed:", tokens);
      return res.redirect(`${APP_URL}/settings/integrations?error=token_exchange_failed`);
    }

    // Get account info
    const accountResponse = await fetch("https://api.dropboxapi.com/2/users/get_current_account", {
      method: "POST",
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const accountInfo = await accountResponse.json();

    // Store integration
    await db.insert(cloudIntegrationsTable).values({
      userId: stateData.userId,
      provider: "dropbox",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expires_in ? new Date(Date.now() + tokens.expires_in * 1000) : null,
      providerAccountEmail: accountInfo.email,
      providerAccountId: accountInfo.account_id,
      isActive: true,
      lastSyncedAt: new Date(),
    });

    res.redirect(stateData.redirect + "&status=connected");
  } catch (err) {
    console.error("Dropbox OAuth callback error:", err);
    res.redirect(`${APP_URL}/settings/integrations?error=callback_failed`);
  }
});

// ============== PROTECTED ROUTES (Require Authentication) ==============
router.use(authenticate);

// ============== INTEGRATION MANAGEMENT ==============

// GET /cloud/integrations - List user's cloud integrations
router.get("/cloud/integrations", async (req, res) => {
  const user = (req as any).user;

  try {
    const integrations = await db
      .select({
        id: cloudIntegrationsTable.id,
        provider: cloudIntegrationsTable.provider,
        providerAccountEmail: cloudIntegrationsTable.providerAccountEmail,
        isActive: cloudIntegrationsTable.isActive,
        lastSyncedAt: cloudIntegrationsTable.lastSyncedAt,
        syncError: cloudIntegrationsTable.syncError,
        createdAt: cloudIntegrationsTable.createdAt,
      })
      .from(cloudIntegrationsTable)
      .where(eq(cloudIntegrationsTable.userId, user.id))
      .orderBy(desc(cloudIntegrationsTable.createdAt));

    res.json(integrations);
  } catch (error) {
    console.error("Failed to fetch cloud integrations:", error);
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// DELETE /cloud/integrations/:id - Disconnect integration
router.delete("/cloud/integrations/:id", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    await db
      .delete(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id)
      ));

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete integration:", error);
    res.status(500).json({ error: "Failed to delete integration" });
  }
});

// POST /cloud/integrations/:id/sync - Trigger sync
router.post("/cloud/integrations/:id/sync", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    // Update last synced
    await db
      .update(cloudIntegrationsTable)
      .set({ lastSyncedAt: new Date(), syncError: null })
      .where(eq(cloudIntegrationsTable.id, integrationId));

    res.json({ success: true, message: "Sync triggered" });
  } catch (error) {
    console.error("Failed to sync integration:", error);
    res.status(500).json({ error: "Failed to sync" });
  }
});

// ============== FILE BROWSING ==============

// GET /cloud/integrations/:id/files - List files from cloud storage
router.get("/cloud/integrations/:id/files", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const { path = "" } = req.query;

  console.log("[DEBUG] List files request:", { integrationId, path, userId: user?.id });

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      console.log("[DEBUG] Integration not found:", integrationId);
      return res.status(404).json({ error: "Integration not found or inactive" });
    }

    console.log("[DEBUG] Found integration:", { 
      id: integration.id, 
      provider: integration.provider,
      hasToken: !!integration.accessToken 
    });

    let files: Array<{ id: string; name: string; type: "file" | "folder"; mimeType?: string; size?: number; modifiedAt?: string }> = [];

    if (integration.provider === "google_drive") {
      files = await listGoogleDriveFiles(integration.accessToken, path as string);
    } else if (integration.provider === "dropbox") {
      files = await listDropboxFiles(integration.accessToken, path as string);
    }

    console.log("[DEBUG] Returning files:", { count: files.length });
    res.json({ files, path });
  } catch (error) {
    console.error("[DEBUG] Failed to list files:", error);
    res.status(500).json({ error: "Failed to list files", message: (error as Error).message });
  }
});

async function listGoogleDriveFiles(accessToken: string, folderId: string): Promise<Array<{ id: string; name: string; type: "file" | "folder"; mimeType?: string; size?: number; modifiedAt?: string }>> {
  const query = folderId 
    ? `'${folderId}' in parents and trashed = false`
    : "trashed = false";
  
  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Google Drive API error: ${response.status}`);
  }

  const data = await response.json();
  
  return data.files.map((file: any) => ({
    id: file.id,
    name: file.name,
    type: file.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file",
    mimeType: file.mimeType,
    size: file.size ? parseInt(file.size) : undefined,
    modifiedAt: file.modifiedTime,
  }));
}

async function listDropboxFiles(accessToken: string, folderId: string): Promise<Array<{ id: string; name: string; type: "file" | "folder"; mimeType?: string; size?: number; modifiedAt?: string }>> {
  // Dropbox uses folder paths, not IDs (unlike Google Drive)
  // folderId is actually a path or empty for root
  const path = folderId || "";
  
  console.log("[DEBUG] Dropbox list folder:", { path, accessToken: accessToken.slice(0, 10) + "..." });
  
  try {
    const response = await fetch("https://api.dropboxapi.com/2/files/list_folder", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        path: path || "", // "" = root, or use the path
        recursive: false,
        include_media_info: false,
        include_deleted: false,
        include_has_explicit_shared_members: false,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      console.error("[DEBUG] Dropbox API error:", { 
        status: response.status, 
        error: errorData 
      });
      throw new Error(`Dropbox API error: ${response.status} - ${errorData.error_summary || 'Unknown error'}`);
    }

    const data = await response.json();
    console.log("[DEBUG] Dropbox response:", { 
      entryCount: data.entries?.length || 0,
      hasMore: data.has_more 
    });
    
    return data.entries.map((entry: any) => ({
      id: entry.id || entry.path_lower, // Use path_lower as ID if id not present
      name: entry.name,
      type: entry[".tag"] === "folder" ? "folder" : "file",
      size: entry.size,
      modifiedAt: entry.client_modified || entry.server_modified,
    }));
  } catch (error) {
    console.error("[DEBUG] listDropboxFiles error:", error);
    throw error;
  }
}

// ============== FILE IMPORT ==============

// POST /cloud/integrations/:id/import - Queue file for import
router.post("/cloud/integrations/:id/import", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  
  const schema = z.object({
    fileId: z.string(),
    fileName: z.string(),
    filePath: z.string().optional(),
    mimeType: z.string().optional(),
    fileSize: z.number().optional(),
    targetPageId: z.number().optional(),
  });

  let body;
  try {
    body = schema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found or inactive" });
    }

    // Add to import queue
    const [queueItem] = await db
      .insert(cloudImportQueueTable)
      .values({
        userId: user.id,
        integrationId,
        providerFileId: body.fileId,
        providerFileName: body.fileName,
        providerFilePath: body.filePath,
        mimeType: body.mimeType,
        fileSize: body.fileSize,
        targetPageId: body.targetPageId,
        status: "pending",
      })
      .returning();

    res.json({ success: true, queueItem });
  } catch (error) {
    console.error("Failed to queue import:", error);
    res.status(500).json({ error: "Failed to queue import" });
  }
});

// GET /cloud/import-queue - Get import queue status
router.get("/cloud/import-queue", async (req, res) => {
  const user = (req as any).user;
  const { status } = req.query;

  try {
    let query = db
      .select({
        id: cloudImportQueueTable.id,
        integrationId: cloudImportQueueTable.integrationId,
        provider: cloudIntegrationsTable.provider,
        providerFileName: cloudImportQueueTable.providerFileName,
        providerFilePath: cloudImportQueueTable.providerFilePath,
        status: cloudImportQueueTable.status,
        errorMessage: cloudImportQueueTable.errorMessage,
        sourceId: cloudImportQueueTable.sourceId,
        createdAt: cloudImportQueueTable.createdAt,
        updatedAt: cloudImportQueueTable.updatedAt,
      })
      .from(cloudImportQueueTable)
      .innerJoin(
        cloudIntegrationsTable,
        eq(cloudImportQueueTable.integrationId, cloudIntegrationsTable.id)
      )
      .where(eq(cloudImportQueueTable.userId, user.id))
      .orderBy(desc(cloudImportQueueTable.createdAt))
      .limit(50);

    if (status) {
      query = query.where(eq(cloudImportQueueTable.status, status as string));
    }

    const items = await query;
    res.json(items);
  } catch (error) {
    console.error("Failed to fetch import queue:", error);
    res.status(500).json({ error: "Failed to fetch queue" });
  }
});

// ============== GOOGLE DRIVE CRUD OPERATIONS ==============

// POST /cloud/integrations/:id/folders - Create new folder
router.post("/cloud/integrations/:id/folders", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  
  const schema = z.object({
    name: z.string().min(1),
    parentId: z.string().optional(), // Google Drive folder ID
  });

  let body;
  try {
    body = schema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.provider !== "google_drive") {
      return res.status(400).json({ error: "Only Google Drive supports this operation" });
    }

    // Create folder in Google Drive
    const response = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: body.name,
        mimeType: "application/vnd.google-apps.folder",
        parents: body.parentId ? [body.parentId] : undefined,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to create folder");
    }

    const folder = await response.json();
    res.json({ id: folder.id, name: body.name, type: "folder" });
  } catch (error) {
    console.error("Failed to create folder:", error);
    res.status(500).json({ error: "Failed to create folder" });
  }
});

// PATCH /cloud/integrations/:id/files/:fileId - Rename or move file/folder
router.patch("/cloud/integrations/:id/files/:fileId", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const fileId = req.params.fileId;
  
  const schema = z.object({
    name: z.string().min(1).optional(),
    parentId: z.string().optional(), // New parent folder
    removeParents: z.array(z.string()).optional(), // Old parents to remove
  });

  let body;
  try {
    body = schema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.provider !== "google_drive") {
      return res.status(400).json({ error: "Only Google Drive supports this operation" });
    }

    const updates: any = {};
    if (body.name) updates.name = body.name;

    const searchParams = new URLSearchParams();
    if (body.parentId) searchParams.set("addParents", body.parentId);
    if (body.removeParents) searchParams.set("removeParents", body.removeParents.join(","));

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?${searchParams}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          "Content-Type": "application/json",
        },
        body: Object.keys(updates).length > 0 ? JSON.stringify(updates) : undefined,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to update file");
    }

    const file = await response.json();
    res.json({ id: file.id, name: file.name, type: file.mimeType === "application/vnd.google-apps.folder" ? "folder" : "file" });
  } catch (error) {
    console.error("Failed to update file:", error);
    res.status(500).json({ error: "Failed to update file" });
  }
});

// DELETE /cloud/integrations/:id/files/:fileId - Delete file/folder
router.delete("/cloud/integrations/:id/files/:fileId", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const fileId = req.params.fileId;

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.provider !== "google_drive") {
      return res.status(400).json({ error: "Only Google Drive supports this operation" });
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${integration.accessToken}` },
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to delete file");
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Failed to delete file:", error);
    res.status(500).json({ error: "Failed to delete file" });
  }
});

// GET /cloud/integrations/:id/files/:fileId/content - Download file content
router.get("/cloud/integrations/:id/files/:fileId/content", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const fileId = req.params.fileId;

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.provider !== "google_drive") {
      return res.status(400).json({ error: "Only Google Drive supports this operation" });
    }

    // Get file metadata first
    const metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      { headers: { Authorization: `Bearer ${integration.accessToken}` } }
    );

    if (!metaResponse.ok) {
      throw new Error("Failed to get file metadata");
    }

    const metadata = await metaResponse.json();

    // For Google Docs/Sheets/etc, export as PDF or text
    let downloadUrl: string;
    if (metadata.mimeType.startsWith("application/vnd.google-apps.")) {
      const exportMimeType = metadata.mimeType.includes("document") 
        ? "text/plain" 
        : "application/pdf";
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=${encodeURIComponent(exportMimeType)}`;
    } else {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }

    const response = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
    });

    if (!response.ok) {
      throw new Error("Failed to download file");
    }

    // Stream the response
    res.setHeader("Content-Type", response.headers.get("content-type") || "application/octet-stream");
    res.setHeader("Content-Disposition", `inline; filename="${metadata.name}"`);
    
    const arrayBuffer = await response.arrayBuffer();
    res.send(Buffer.from(arrayBuffer));
  } catch (error) {
    console.error("Failed to download file:", error);
    res.status(500).json({ error: "Failed to download file" });
  }
});

// POST /cloud/integrations/:id/upload - Upload file to Google Drive
router.post("/cloud/integrations/:id/upload", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.provider !== "google_drive") {
      return res.status(400).json({ error: "Only Google Drive supports this operation" });
    }

    // For multipart upload, we'd need to handle the request body differently
    // This is a simplified version that expects metadata in query and file in body
    const { name, parentId, mimeType } = req.query;
    
    if (!name) {
      return res.status(400).json({ error: "File name is required" });
    }

    // Create file metadata
    const metadata = {
      name: name as string,
      mimeType: (mimeType as string) || "application/octet-stream",
      parents: parentId ? [parentId as string] : undefined,
    };

    // Simple upload for files under 5MB
    // For larger files, resumable upload would be needed
    const boundary = "-------314159265358979323846";
    const delimiter = "\r\n--" + boundary + "\r\n";
    const closeDelim = "\r\n--" + boundary + "--";

    const body = 
      delimiter +
      "Content-Type: application/json; charset=UTF-8\r\n\r\n" +
      JSON.stringify(metadata) +
      delimiter +
      "Content-Type: " + metadata.mimeType + "\r\n\r\n" +
      (req.body || "") +
      closeDelim;

    const response = await fetch(
      "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          "Content-Type": "multipart/related; boundary=" + boundary,
          "Content-Length": Buffer.byteLength(body).toString(),
        },
        body,
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || "Failed to upload file");
    }

    const file = await response.json();
    res.json({ id: file.id, name: file.name, type: "file" });
  } catch (error) {
    console.error("Failed to upload file:", error);
    res.status(500).json({ error: "Failed to upload file" });
  }
});

// ============== AI ANALYSIS ENDPOINTS ==============

// POST /cloud/integrations/:id/files/:fileId/ai-analyze - Analyze file with AI
router.post("/cloud/integrations/:id/files/:fileId/ai-analyze", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const fileId = req.params.fileId;
  
  const schema = z.object({
    prompt: z.string().default("Analyze this document and provide a summary of its key points."),
    maxTokens: z.number().optional(),
  });

  let body;
  try {
    body = schema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    // Download file content
    const metaResponse = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
      { headers: { Authorization: `Bearer ${integration.accessToken}` } }
    );

    if (!metaResponse.ok) {
      throw new Error("Failed to get file metadata");
    }

    const metadata = await metaResponse.json();

    // Only analyze text-based files for now
    const textMimeTypes = [
      "text/plain", "text/html", "text/csv", 
      "application/json", "application/pdf",
      "application/vnd.google-apps.document"
    ];
    
    if (!textMimeTypes.some(t => metadata.mimeType?.includes(t) || metadata.mimeType?.startsWith("text/"))) {
      return res.status(400).json({ 
        error: "File type not supported for AI analysis", 
        mimeType: metadata.mimeType 
      });
    }

    // Get file content
    let downloadUrl: string;
    if (metadata.mimeType.startsWith("application/vnd.google-apps.")) {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
    } else {
      downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
    }

    const contentResponse = await fetch(downloadUrl, {
      headers: { Authorization: `Bearer ${integration.accessToken}` },
    });

    if (!contentResponse.ok) {
      throw new Error("Failed to download file content");
    }

    const content = await contentResponse.text();
    
    // Truncate if too long
    const maxLength = 15000;
    const truncatedContent = content.length > maxLength 
      ? content.slice(0, maxLength) + "\n\n[Content truncated...]" 
      : content;

    // Call AI analysis (using existing Groq integration)
    const aiResponse = await fetch(`${process.env.AI_INTEGRATIONS_GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_INTEGRATIONS_GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: "You are a helpful assistant analyzing documents." },
          { role: "user", content: `${body.prompt}\n\nDocument: "${metadata.name}"\n\n${truncatedContent}` },
        ],
        max_tokens: body.maxTokens || 2000,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI analysis failed");
    }

    const aiResult = await aiResponse.json();
    const analysis = aiResult.choices?.[0]?.message?.content || "No analysis available";

    res.json({
      fileId,
      fileName: metadata.name,
      analysis,
      contentLength: content.length,
    });
  } catch (error) {
    console.error("Failed to analyze file:", error);
    res.status(500).json({ error: "Failed to analyze file" });
  }
});

// POST /cloud/integrations/:id/ai-create-document - Create new document with AI
router.post("/cloud/integrations/:id/ai-create-document", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  
  const schema = z.object({
    prompt: z.string().min(1), // What to create (e.g., "Write a meeting agenda for...")
    title: z.string().min(1),
    parentId: z.string().optional(), // Folder to create in
    type: z.enum(["document", "notes", "report"]).default("document"),
  });

  let body;
  try {
    body = schema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.provider !== "google_drive") {
      return res.status(400).json({ error: "Only Google Drive supports this operation" });
    }

    // Generate content with AI
    const aiResponse = await fetch(`${process.env.AI_INTEGRATIONS_GROQ_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.AI_INTEGRATIONS_GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { 
            role: "system", 
            content: `You are a helpful assistant creating ${body.type} content. Generate well-formatted, professional content.` 
          },
          { role: "user", content: body.prompt },
        ],
        max_tokens: 4000,
      }),
    });

    if (!aiResponse.ok) {
      throw new Error("AI content generation failed");
    }

    const aiResult = await aiResponse.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Create Google Doc with the content
    // First, create an empty doc
    const createResponse = await fetch("https://www.googleapis.com/drive/v3/files", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${integration.accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        name: body.title,
        mimeType: "application/vnd.google-apps.document",
        parents: body.parentId ? [body.parentId] : undefined,
      }),
    });

    if (!createResponse.ok) {
      throw new Error("Failed to create Google Doc");
    }

    const doc = await createResponse.json();

    // Note: To actually insert content, we'd need to use the Docs API
    // For now, return the created doc info and content separately
    res.json({
      id: doc.id,
      name: body.title,
      type: "document",
      content,
      message: "Document created. Content is ready to be copied into the document.",
    });
  } catch (error) {
    console.error("Failed to create AI document:", error);
    res.status(500).json({ error: "Failed to create document" });
  }
});

// ============== AI AGENT TOOLS ==============

// GET /cloud/integrations/:id/ai-tools - Get available AI tools for this integration
router.get("/cloud/integrations/:id/ai-tools", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    return res.status(400).json({ error: "Invalid integration ID" });
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id),
        eq(cloudIntegrationsTable.isActive, true)
      ));

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    const tools = [
      {
        name: "list_files",
        description: "List files and folders in Google Drive",
        parameters: {
          folderId: { type: "string", description: "Optional folder ID to list contents of" },
          query: { type: "string", description: "Search query for files" },
        },
      },
      {
        name: "read_file",
        description: "Read content of a text-based file",
        parameters: {
          fileId: { type: "string", description: "ID of the file to read" },
        },
      },
      {
        name: "create_folder",
        description: "Create a new folder",
        parameters: {
          name: { type: "string", description: "Name of the folder" },
          parentId: { type: "string", description: "Optional parent folder ID" },
        },
      },
      {
        name: "create_document",
        description: "Create a new document with AI-generated content",
        parameters: {
          title: { type: "string", description: "Title of the document" },
          content: { type: "string", description: "Content for the document" },
          parentId: { type: "string", description: "Optional parent folder ID" },
        },
      },
      {
        name: "move_file",
        description: "Move a file to a different folder",
        parameters: {
          fileId: { type: "string", description: "ID of the file to move" },
          folderId: { type: "string", description: "ID of the destination folder" },
        },
      },
      {
        name: "analyze_file",
        description: "Analyze a file with AI and provide insights",
        parameters: {
          fileId: { type: "string", description: "ID of the file to analyze" },
          question: { type: "string", description: "Specific question about the file" },
        },
      },
    ];

    res.json({ integrationId, provider: integration.provider, tools });
  } catch (error) {
    console.error("Failed to fetch AI tools:", error);
    res.status(500).json({ error: "Failed to fetch tools" });
  }
});

export default router;
export { listGoogleDriveFiles, listDropboxFiles };
