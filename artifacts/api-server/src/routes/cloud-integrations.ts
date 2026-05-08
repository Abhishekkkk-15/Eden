import { Router, type IRouter } from "express";
import {
  db,
  cloudIntegrationsTable,
  cloudImportQueueTable,
  sourcesTable,
  pagesTable,
} from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { z } from "zod";
import { queueCloudImport } from "../lib/cloud-import-processor";
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
const NOTION_CLIENT_ID = process.env.NOTION_CLIENT_ID || "";
const NOTION_CLIENT_SECRET = process.env.NOTION_CLIENT_SECRET || "";
const APP_URL = process.env.APP_URL || "http://localhost:3000";
const API_URL = process.env.API_URL || "http://localhost:4000";
console.log(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET);
// ============== GOOGLE DRIVE OAUTH ==============

// GET /cloud/google/auth - Start Google Drive OAuth flow
router.get("/cloud/google/auth", async (req, res) => {
  const user = getUserFromHeader(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    return;
  }

  if (!GOOGLE_CLIENT_ID) {
    res.status(500).json({ error: "Google Drive not configured" });
    return;
  }

  const redirectUri = `${API_URL}/api/cloud/google/callback`;
  const state = Buffer.from(
    JSON.stringify({
      userId: user.id,
      redirect: `${APP_URL}/settings/integrations?provider=google_drive`,
    }),
  ).toString("base64");

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", GOOGLE_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  // Full drive access for CRUD operations
  authUrl.searchParams.set(
    "scope",
    "https://www.googleapis.com/auth/drive https://www.googleapis.com/auth/userinfo.email",
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("state", state);

  res.json({ authUrl: authUrl.toString() });
  return;
});

// GET /cloud/google/callback - OAuth callback
router.get("/cloud/google/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    res.redirect(`${APP_URL}/settings/integrations?error=auth_failed`);
    return;
  }

  try {
    const stateData = JSON.parse(
      Buffer.from(state as string, "base64").toString(),
    );
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
      res.redirect(
        `${APP_URL}/settings/integrations?error=token_exchange_failed`,
      );
      return;
    }

    // Get user info
    const userInfoResponse = await fetch(
      "https://www.googleapis.com/oauth2/v2/userinfo",
      {
        headers: { Authorization: `Bearer ${(tokens as any).access_token}` },
      },
    );
    const userInfo = (await userInfoResponse.json()) as any;

    // Store integration
    await db.insert(cloudIntegrationsTable).values({
      userId: stateData.userId,
      provider: "google_drive",
      accessToken: (tokens as any).access_token,
      refreshToken: (tokens as any).refresh_token,
      tokenExpiresAt: (tokens as any).expires_in ?
        new Date(Date.now() + (tokens as any).expires_in * 1000)
        : null,
      providerAccountEmail: userInfo.email,
      providerAccountId: userInfo.id,
      isActive: true,
      lastSyncedAt: new Date(),
    });

    res.redirect(stateData.redirect + "&status=connected");
    return;
  } catch (err) {
    console.error("Google OAuth callback error:", err);
    res.redirect(`${APP_URL}/settings/integrations?error=callback_failed`);
    return;
  }
});

// ============== DROPBOX OAUTH ==============

// GET /cloud/dropbox/auth - Start Dropbox OAuth flow
router.get("/cloud/dropbox/auth", async (req, res) => {
  const user = getUserFromHeader(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    return;
  }

  if (!DROPBOX_APP_KEY) {
    res.status(500).json({ error: "Dropbox not configured" });
    return;
  }

  const redirectUri = `${API_URL}/api/cloud/dropbox/callback`;
  const state = Buffer.from(
    JSON.stringify({
      userId: user.id,
      redirect: `${APP_URL}/settings/integrations?provider=dropbox`,
    }),
  ).toString("base64");

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
    res.redirect(`${APP_URL}/settings/integrations?error=auth_failed`);
    return;
  }

  try {
    const stateData = JSON.parse(
      Buffer.from(state as string, "base64").toString(),
    );
    const redirectUri = `${API_URL}/api/cloud/dropbox/callback`;

    // Exchange code for tokens
    const tokenResponse = await fetch(
      "https://api.dropboxapi.com/oauth2/token",
      {
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
      },
    );

    const tokens = (await tokenResponse.json()) as any;

    if (!tokenResponse.ok) {
      console.error("Dropbox token exchange failed:", tokens);
      res.redirect(
        `${APP_URL}/settings/integrations?error=token_exchange_failed`,
      );
      return;
    }

    // Get account info
    const accountResponse = await fetch(
      "https://api.dropboxapi.com/2/users/get_current_account",
      {
        method: "POST",
        headers: { Authorization: `Bearer ${tokens.access_token}` },
      },
    );
    const accountInfo = (await accountResponse.json()) as any;

    // Store integration
    await db.insert(cloudIntegrationsTable).values({
      userId: stateData.userId,
      provider: "dropbox",
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
      tokenExpiresAt: tokens.expires_in ?
        new Date(Date.now() + tokens.expires_in * 1000)
        : null,
      providerAccountEmail: accountInfo.email,
      providerAccountId: accountInfo.account_id,
      isActive: true,
      lastSyncedAt: new Date(),
    });

    res.redirect(stateData.redirect + "&status=connected");
    return;
  } catch (err) {
    console.error("Dropbox OAuth callback error:", err);
    res.redirect(`${APP_URL}/settings/integrations?error=callback_failed`);
    return;
  }
});

// ============== NOTION OAUTH ==============

// GET /cloud/notion/auth - Start Notion OAuth flow
router.get("/cloud/notion/auth", async (req, res) => {
  const user = getUserFromHeader(req);
  if (!user) {
    res.status(401).json({ error: "Unauthorized: Missing or invalid token" });
    return;
  }

  if (!NOTION_CLIENT_ID) {
    res.status(500).json({ error: "Notion integration not configured" });
    return;
  }

  const redirectUri = `${API_URL}/api/cloud/notion/callback`;
  const state = Buffer.from(
    JSON.stringify({
      userId: user.id,
      redirect: `${APP_URL}/settings/integrations?provider=notion`,
    }),
  ).toString("base64");

  const authUrl = new URL("https://api.notion.com/v1/oauth/authorize");
  authUrl.searchParams.set("client_id", NOTION_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("owner", "user");
  authUrl.searchParams.set("state", state);

  res.json({ authUrl: authUrl.toString() });
  return;
});

// GET /cloud/notion/callback - OAuth callback
router.get("/cloud/notion/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error || !code) {
    console.error("Notion OAuth error:", error);
    res.redirect(`${APP_URL}/settings/integrations?error=auth_failed`);
    return;
  }

  try {
    const stateData = JSON.parse(
      Buffer.from(state as string, "base64").toString(),
    );
    const redirectUri = `${API_URL}/api/cloud/notion/callback`;

    // Exchange code for tokens
    const authHeader = Buffer.from(`${NOTION_CLIENT_ID}:${NOTION_CLIENT_SECRET}`).toString("base64");
    const tokenResponse = await fetch("https://api.notion.com/v1/oauth/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Basic ${authHeader}`,
      },
      body: JSON.stringify({
        grant_type: "authorization_code",
        code: code as string,
        redirect_uri: redirectUri,
      }),
    });

    const tokens = await tokenResponse.json();

    if (!tokenResponse.ok) {
      console.error("Notion token exchange failed:", tokens);
      res.redirect(`${APP_URL}/settings/integrations?error=token_exchange_failed`);
      return;
    }

    // Store integration
    await db.insert(cloudIntegrationsTable).values({
      userId: stateData.userId,
      provider: "notion",
      accessToken: (tokens as any).access_token,
      providerAccountId: (tokens as any).workspace_id,
      providerAccountEmail: (tokens as any).workspace_name || "Notion Workspace",
      syncSettings: {
        workspaceName: (tokens as any).workspace_name,
        workspaceIcon: (tokens as any).workspace_icon,
        owner: (tokens as any).owner,
      },
      isActive: true,
      lastSyncedAt: new Date(),
    });

    res.redirect(stateData.redirect + "&status=connected");
    return;
  } catch (err) {
    console.error("Notion OAuth callback error:", err);
    res.redirect(`${APP_URL}/settings/integrations?error=callback_failed`);
    return;
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
        syncSettings: cloudIntegrationsTable.syncSettings,
      })
      .from(cloudIntegrationsTable)
      .where(eq(cloudIntegrationsTable.userId, user.id))
      .orderBy(desc(cloudIntegrationsTable.createdAt));

    res.json(integrations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch integrations" });
  }
});

// POST /cloud/integrations/:id/notion/setup - Create the research database
router.post("/cloud/integrations/:id/notion/setup", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.provider, "notion")
        )
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    const accessToken = integration.accessToken;

    // 1. Find a parent page to host the database
    const searchRes = await fetch("https://api.notion.com/v1/search", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        filter: { property: "object", value: "page" },
        page_size: 1
      }),
    });

    const searchData = await searchRes.json();
    const parentPage = (searchData as any).results?.[0];

    if (!parentPage) {
      res.status(400).json({ error: "No accessible Notion pages found. Please share a page with Eden first." });
      return;
    }

    // 2. Create the "Eden Research" database
    const createRes = await fetch("https://api.notion.com/v1/databases", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Notion-Version": "2022-06-28",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        parent: { type: "page_id", page_id: parentPage.id },
        title: [{ type: "text", text: { content: "Eden Research" } }],
        properties: {
          Name: { title: {} },
          Status: {
            select: {
              options: [
                { name: "Pending", color: "gray" },
                { name: "Analyzing...", color: "yellow" },
                { name: "Done", color: "green" }
              ]
            }
          },
          "Eden Report": { rich_text: {} }
        }
      }),
    });

    if (!createRes.ok) {
      const error = await createRes.text();
      throw new Error(`Failed to create database: ${error}`);
    }

    const newDb = await createRes.json();

    // Store the database ID in syncSettings
    await db.update(cloudIntegrationsTable)
      .set({
        syncSettings: {
          ...(integration.syncSettings as any),
          researchDatabaseId: (newDb as any).id,
          researchDatabaseUrl: (newDb as any).url,
        }
      })
      .where(eq(cloudIntegrationsTable.id, integrationId));

    res.json({ success: true, databaseUrl: (newDb as any).url });
  } catch (error) {
    console.error("Notion setup error:", error);
    res.status(500).json({ error: "Failed to automate Notion setup" });
  }
});

// PATCH /cloud/integrations/:id/settings - Update integration settings
router.patch("/cloud/integrations/:id/settings", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const { syncSettings } = req.body;

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id)
        )
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    await db.update(cloudIntegrationsTable)
      .set({
        syncSettings: {
          ...(integration.syncSettings as any),
          ...syncSettings
        },
        updatedAt: new Date()
      })
      .where(eq(cloudIntegrationsTable.id, integrationId));

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Failed to update settings" });
  }
});

// PATCH /cloud/integrations/:id - Update integration settings
router.patch("/cloud/integrations/:id", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  const schema = z.object({
    isActive: z.boolean().optional(),
    syncSettings: z.record(z.unknown()).optional(),
  });

  try {
    const data = schema.parse(req.body);

    const [updated] = await db
      .update(cloudIntegrationsTable)
      .set({
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
        ...(data.syncSettings ? { syncSettings: data.syncSettings } : {}),
        updatedAt: new Date(),
      })
      .where(and(
        eq(cloudIntegrationsTable.id, integrationId),
        eq(cloudIntegrationsTable.userId, user.id)
      ))
      .returning();

    if (!updated) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    res.json(updated);
    return;
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
    } else {
      console.error("Failed to update cloud integration:", error);
      res.status(500).json({ error: "Failed to update integration" });
    }
    return;
  }
});

// DELETE /cloud/integrations/:id - Disconnect integration
router.delete("/cloud/integrations/:id", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    await db
      .delete(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
        ),
      );

    res.json({ success: true });
    return;
  } catch (error) {
    console.error("Failed to delete integration:", error);
    res.status(500).json({ error: "Failed to delete integration" });
    return;
  }
});

// POST /cloud/integrations/:id/sync - Trigger sync
router.post("/cloud/integrations/:id/sync", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    // Update last synced
    await db
      .update(cloudIntegrationsTable)
      .set({ lastSyncedAt: new Date(), syncError: null })
      .where(eq(cloudIntegrationsTable.id, integrationId));

    res.json({ success: true, message: "Sync triggered" });
    return;
  } catch (error) {
    console.error("Failed to sync integration:", error);
    res.status(500).json({ error: "Failed to sync" });
    return;
  }
});

// ============== FILE BROWSING ==============

// GET /cloud/integrations/:id/files - List files from cloud storage
router.get("/cloud/integrations/:id/files", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const { path = "" } = req.query;

  console.log("[DEBUG] List files request:", {
    integrationId,
    path,
    userId: user?.id,
  });

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      console.log("[DEBUG] Integration not found:", integrationId);
      res.status(404).json({ error: "Integration not found or inactive" });
      return;
    }

    console.log("[DEBUG] Found integration:", {
      id: integration.id,
      provider: integration.provider,
      hasToken: !!integration.accessToken,
    });

    let files: Array<{
      id: string;
      name: string;
      type: "file" | "folder";
      mimeType?: string;
      size?: number;
      modifiedAt?: string;
    }> = [];

    if (integration.provider === "google_drive") {
      files = await listGoogleDriveFiles(
        integration.accessToken,
        path as string,
      );
    } else if (integration.provider === "dropbox") {
      files = await listDropboxFiles(integration.accessToken, path as string);
    } else if (integration.provider === "notion") {
      files = await listNotionItems(integration.accessToken);
    }

    console.log("[DEBUG] Returning files (before filtering):", { count: files.length });

    // Apply filters from syncSettings
    const settings = integration.syncSettings as any;
    if (settings?.fileTypeFilters && Array.isArray(settings.fileTypeFilters) && settings.fileTypeFilters.length > 0) {
      const filters = settings.fileTypeFilters as string[];
      files = files.filter(file => {
        if (file.type === "folder") return true; // Always show folders
        const mime = file.mimeType?.toLowerCase() || "";
        if (filters.includes("image") && mime.startsWith("image/")) return true;
        if (filters.includes("video") && mime.startsWith("video/")) return true;
        if (filters.includes("audio") && mime.startsWith("audio/")) return true;
        if (filters.includes("document") && (
          mime === "application/pdf" || 
          mime.includes("word") || 
          mime.includes("text/") || 
          mime.includes("google-apps.document") ||
          mime.includes("google-apps.spreadsheet")
        )) return true;
        return false;
      });
    }

    console.log("[DEBUG] Returning files (after filtering):", { count: files.length });
    res.json({ files, path });
    return;
  } catch (error) {
    console.error("[DEBUG] Failed to list files:", error);
    res.status(500).json({
      error: "Failed to list files",
      message: (error as Error).message,
    });
    return;
  }
});

async function listGoogleDriveFiles(
  accessToken: string,
  folderId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    type: "file" | "folder";
    mimeType?: string;
    size?: number;
    modifiedAt?: string;
  }>
> {
  const query =
    folderId ?
      `'${folderId}' in parents and trashed = false`
    : "trashed = false";

  const response = await fetch(
    `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,modifiedTime)&orderBy=name`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );

  if (!response.ok) {
    throw new Error(`Google Drive API error: ${response.status}`);
  }

  const data = await response.json() as any;

  return data.files.map((file: any) => ({
    id: file.id,
    name: file.name,
    type:
      file.mimeType === "application/vnd.google-apps.folder" ?
        "folder"
      : "file",
    mimeType: file.mimeType,
    size: file.size ? parseInt(file.size) : undefined,
    modifiedAt: file.modifiedTime,
  }));
}

async function listDropboxFiles(
  accessToken: string,
  folderId: string,
): Promise<
  Array<{
    id: string;
    name: string;
    type: "file" | "folder";
    mimeType?: string;
    size?: number;
    modifiedAt?: string;
  }>
> {
  // Dropbox uses folder paths, not IDs (unlike Google Drive)
  // folderId is actually a path or empty for root
  let normalizedPath = folderId || "";
  if (normalizedPath === "/") {
    normalizedPath = "";
  } else if (
    normalizedPath !== "" &&
    !normalizedPath.startsWith("/") &&
    !normalizedPath.startsWith("id:")
  ) {
    normalizedPath = "/" + normalizedPath;
  }

  console.log("[DEBUG] Dropbox list folder:", {
    path: normalizedPath,
    originalPath: folderId,
    accessToken: accessToken.slice(0, 10) + "...",
  });

  try {
    const response = await fetch(
      "https://api.dropboxapi.com/2/files/list_folder",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          path: normalizedPath, // "" = root, or use the path starting with /
          recursive: false,
          include_media_info: false,
          include_deleted: false,
          include_has_explicit_shared_members: false,
        }),
      },
    );
    if (!response.ok) {
      let errorData: any = {};
      const responseText = await response.text();
      try {
        errorData = JSON.parse(responseText);
      } catch (e) {
        errorData = { error_summary: responseText };
      }
      console.error("[DEBUG] Dropbox API error:", {
        status: response.status,
        error: errorData,
      });
      throw new Error(
        `Dropbox API error: ${response.status} - ${errorData.error_summary || "Unknown error"}`,
      );
    }

    const data = await response.json() as any;
    console.log("[DEBUG] Dropbox response:", {
      entryCount: data.entries?.length || 0,
      hasMore: data.has_more,
    });

    return data.entries.map((entry: any) => ({
      id: entry.id || entry.path_lower,
      name: entry.name,
      type: entry[".tag"] === "folder" ? "folder" : "file",
      mimeType:
        entry.mime_type ||
        (entry[".tag"] === "file" ? "application/octet-stream" : undefined),
      path: entry.path_display || entry.path_lower,
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
    indexOnly: z.boolean().optional(),
  });

  let body;
  try {
    body = schema.parse(req.body);
  } catch (error) {
    return res.status(400).json({ error: "Invalid request body" });
  }

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found or inactive" });
      return;
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
        indexOnly: body.indexOnly,
      })
      .returning();

    if (queueItem) {
      await queueCloudImport(queueItem.id);
    }

    res.status(201).json(queueItem);
    return;
  } catch (error) {
    console.error("Failed to queue import:", error);
    res.status(500).json({ error: "Failed to queue import" });
    return;
  }
});

// GET /cloud/import-queue - Get import queue status
router.get("/cloud/import-queue", async (req, res) => {
  const user = (req as any).user;
  const { status } = req.query;

  try {
    const conditions = [eq(cloudImportQueueTable.userId, user.id)];
    if (status) {
      conditions.push(eq(cloudImportQueueTable.status, status as string));
    }

    const items = await db
      .select({
        id: cloudImportQueueTable.id,
        integrationId: cloudImportQueueTable.integrationId,
        provider: cloudIntegrationsTable.provider,
        providerAccountEmail: cloudIntegrationsTable.providerAccountEmail,
        fileId: cloudImportQueueTable.providerFileId,
        fileName: cloudImportQueueTable.providerFileName,
        filePath: cloudImportQueueTable.providerFilePath,
        mimeType: cloudImportQueueTable.mimeType,
        sourceId: cloudImportQueueTable.sourceId,
        status: cloudImportQueueTable.status,
        error: cloudImportQueueTable.errorMessage,
        indexOnly: cloudImportQueueTable.indexOnly,
        createdAt: cloudImportQueueTable.createdAt,
        updatedAt: cloudImportQueueTable.updatedAt,
      })
      .from(cloudImportQueueTable)
      .innerJoin(
        cloudIntegrationsTable,
        eq(cloudImportQueueTable.integrationId, cloudIntegrationsTable.id),
      )
      .where(and(...conditions))
      .orderBy(desc(cloudImportQueueTable.createdAt))
      .limit(50);
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
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      return res.status(404).json({ error: "Integration not found" });
    }

    if (integration.provider !== "google_drive") {
      return res
        .status(400)
        .json({ error: "Only Google Drive supports this operation" });
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
      const error = await response.json() as any;
      throw new Error(error.error?.message || "Failed to create folder");
    }

    const folder = await response.json() as any;
    res.json({ id: folder.id, name: body.name, type: "folder" });
    return;
  } catch (error) {
    console.error("Failed to create folder:", error);
    res.status(500).json({ error: "Failed to create folder" });
    return;
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
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    if (integration.provider !== "google_drive") {
      res.status(400).json({ error: "Only Google Drive supports this operation" });
      return;
    }

    const updates: any = {};
    if (body.name) updates.name = body.name;

    const searchParams = new URLSearchParams();
    if (body.parentId) searchParams.set("addParents", body.parentId);
    if (body.removeParents)
      searchParams.set("removeParents", body.removeParents.join(","));

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?${searchParams}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${integration.accessToken}`,
          "Content-Type": "application/json",
        },
        body:
          Object.keys(updates).length > 0 ? JSON.stringify(updates) : undefined,
      },
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.error?.message || "Failed to update file");
    }

    const file = await response.json() as any;
    res.json({
      id: file.id,
      name: file.name,
      type:
        file.mimeType === "application/vnd.google-apps.folder" ?
          "folder"
        : "file",
    });
    return;
  } catch (error) {
    console.error("Failed to update file:", error);
    res.status(500).json({ error: "Failed to update file" });
    return;
  }
});

// DELETE /cloud/integrations/:id/files/:fileId - Delete file/folder
router.delete("/cloud/integrations/:id/files/:fileId", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);
  const fileId = req.params.fileId;

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    if (integration.provider !== "google_drive") {
      res.status(400).json({ error: "Only Google Drive supports this operation" });
      return;
    }

    const response = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}`,
      {
        method: "DELETE",
        headers: { Authorization: `Bearer ${integration.accessToken}` },
      },
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.error?.message || "Failed to delete file");
    }

    res.json({ success: true });
    return;
  } catch (error) {
    console.error("Failed to delete file:", error);
    res.status(500).json({ error: "Failed to delete file" });
    return;
  }
});

// GET /cloud/integrations/:id/files/:fileId/content - Download file content
router.get(
  "/cloud/integrations/:id/files/:fileId/content",
  async (req, res) => {
    const user = (req as any).user;
    const integrationId = parseInt(req.params.id);
    const fileId = req.params.fileId;

    if (isNaN(integrationId)) {
      res.status(400).json({ error: "Invalid integration ID" });
      return;
    }

    try {
      const [integration] = await db
        .select()
        .from(cloudIntegrationsTable)
        .where(
          and(
            eq(cloudIntegrationsTable.id, integrationId),
            eq(cloudIntegrationsTable.userId, user.id),
            eq(cloudIntegrationsTable.isActive, true),
          ),
        );

      if (!integration) {
        res.status(404).json({ error: "Integration not found" });
        return;
      }

      if (integration.provider !== "google_drive") {
        res.status(400).json({ error: "Only Google Drive supports this operation" });
        return;
      }

      // Get file metadata first
      const metaResponse = await fetch(
        `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
        { headers: { Authorization: `Bearer ${integration.accessToken}` } },
      );

      if (!metaResponse.ok) {
        throw new Error("Failed to get file metadata");
      }

      const metadata = await metaResponse.json() as any;

      // For Google Docs/Sheets/etc, export as PDF or text
      let downloadUrl: string;
      if (metadata.mimeType.startsWith("application/vnd.google-apps.")) {
        const exportMimeType =
          metadata.mimeType.includes("document") ?
            "text/plain"
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
      res.setHeader(
        "Content-Type",
        response.headers.get("content-type") || "application/octet-stream",
      );
      res.setHeader(
        "Content-Disposition",
        `inline; filename="${metadata.name}"`,
      );

      const arrayBuffer = await response.arrayBuffer();
      res.send(Buffer.from(arrayBuffer));
      return;
    } catch (error) {
      console.error("Failed to download file:", error);
      res.status(500).json({ error: "Failed to download file" });
      return;
    }
  },
);

// POST /cloud/integrations/:id/upload - Upload file to Google Drive
router.post("/cloud/integrations/:id/upload", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    if (integration.provider !== "google_drive") {
      res.status(400).json({ error: "Only Google Drive supports this operation" });
      return;
    }

    // For multipart upload, we'd need to handle the request body differently
    // This is a simplified version that expects metadata in query and file in body
    const { name, parentId, mimeType } = req.query;

    if (!name) {
      res.status(400).json({ error: "File name is required" });
      return;
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
      "Content-Type: " +
      metadata.mimeType +
      "\r\n\r\n" +
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
      },
    );

    if (!response.ok) {
      const error = await response.json() as any;
      throw new Error(error.error?.message || "Failed to upload file");
    }

    const file = await response.json() as any;
    res.json({ id: file.id, name: file.name, type: "file" });
    return;
  } catch (error) {
    console.error("Failed to upload file:", error);
    res.status(500).json({ error: "Failed to upload file" });
    return;
  }
});

// ============== AI ANALYSIS ENDPOINTS ==============

// POST /cloud/integrations/:id/files/:fileId/ai-analyze - Analyze file with AI
router.post(
  "/cloud/integrations/:id/files/:fileId/ai-analyze",
  async (req, res) => {
    const user = (req as any).user;
    const integrationId = parseInt(req.params.id);
    const fileId = req.params.fileId;

    const schema = z.object({
      prompt: z
        .string()
        .default(
          "Analyze this document and provide a summary of its key points.",
        ),
      maxTokens: z.number().optional(),
    });

    let body;
    try {
      body = schema.parse(req.body);
    } catch (error) {
      res.status(400).json({ error: "Invalid request body" });
      return;
    }

    if (isNaN(integrationId)) {
      res.status(400).json({ error: "Invalid integration ID" });
      return;
    }

    try {
      const [integration] = await db
        .select()
        .from(cloudIntegrationsTable)
        .where(
          and(
            eq(cloudIntegrationsTable.id, integrationId),
            eq(cloudIntegrationsTable.userId, user.id),
            eq(cloudIntegrationsTable.isActive, true),
          ),
        );

      if (!integration) {
        res.status(404).json({ error: "Integration not found" });
        return;
      }

      let fileName = "file";
      let content = "";
      let mimeType = "";
      console.log(`[AI Analyze] Starting analysis for file ${fileId} via integration ${integrationId} (${integration.provider})`);

      if (integration.provider === "google_drive") {
        const metaResponse = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=name,mimeType,size`,
          { headers: { Authorization: `Bearer ${integration.accessToken}` } },
        );
        if (!metaResponse.ok)
          throw new Error("Failed to get Google Drive metadata");
        const metadata = await metaResponse.json() as any;
        fileName = metadata.name;
        mimeType = metadata.mimeType;
        console.log(`[AI Analyze] Google Drive Metadata: name=${fileName}, mimeType=${mimeType}`);

        // Try to export to text if it's a Google Doc or a type that supports it
        let downloadUrl: string;
        if (mimeType.startsWith("application/vnd.google-apps.")) {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}/export?mimeType=text/plain`;
        } else if (
          mimeType === "application/pdf" ||
          mimeType.includes("word") ||
          mimeType.includes("text")
        ) {
          // Some regular files can also be exported by Drive if they are converted
          // But for most, we just download as media
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        } else {
          downloadUrl = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`;
        }

        console.log(`[AI Analyze] Google Drive Download URL: ${downloadUrl}`);
        const contentResponse = await fetch(downloadUrl, {
          headers: { Authorization: `Bearer ${integration.accessToken}` },
        });

        if (!contentResponse.ok) {
          // Fallback for PDF/Docs if export failed
          if (downloadUrl.includes("/export")) {
            const fallbackResponse = await fetch(
              `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
              {
                headers: { Authorization: `Bearer ${integration.accessToken}` },
              },
            );
            if (fallbackResponse.ok) {
              content = await fallbackResponse.text();
            } else {
              throw new Error(
                "Failed to download file content (tried export and media)",
              );
            }
          } else {
            throw new Error("Failed to download Google Drive content");
          }
        } else {
          content = await contentResponse.text();
        }
        console.log(`[AI Analyze] Google Drive content downloaded, length=${content.length}`);
      } else if (integration.provider === "dropbox") {
        // Decode path if it was encoded by frontend
        const path =
          fileId.startsWith("/") ? fileId : decodeURIComponent(fileId);

        // Get metadata
        const metaResponse = await fetch(
          "https://api.dropboxapi.com/2/files/get_metadata",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ path }),
          },
        );
        if (!metaResponse.ok) throw new Error("Failed to get Dropbox metadata");
        const metadata = await metaResponse.json() as any;
        fileName = metadata.name;

        // Download content with safe header encoding
        const arg = JSON.stringify({ path });
        const safeArg = arg.replace(
          /[^\x20-\x7E]/g,
          (c) => "\\u" + ("000" + c.charCodeAt(0).toString(16)).slice(-4),
        );

        const contentResponse = await fetch(
          "https://content.dropboxapi.com/2/files/download",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Dropbox-API-Arg": safeArg,
            },
          },
        );
        if (!contentResponse.ok)
          throw new Error("Failed to download Dropbox content");
        content = await contentResponse.text();
        console.log(`[AI Analyze] Dropbox content downloaded, length=${content.length}`);
      } else {
        res.status(400).json({ error: "Unsupported provider for direct analysis" });
        return;
      }

      // Clean up content (remove non-printable characters if it's a binary file)
      const cleanContent = content
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
        .trim();
      if (cleanContent.length < 10 && content.length > 100) {
        // Likely a binary file with no printable text
        content =
          `[Note: This file appears to be a binary file (${mimeType || "unknown"}). AI analysis might be limited as no plain text could be extracted.]\n\n` +
          cleanContent;
      } else {
        content = cleanContent;
      }

      // Truncate if too long
      const maxLength = 30000;
      const truncatedContent =
        content.length > maxLength ?
          content.slice(0, maxLength) + "\n\n[Content truncated...]"
        : content;

      console.log(`[AI Analyze] Final content length for AI: ${truncatedContent.length}`);

      // Call AI analysis (using existing Groq integration)
      const groqBaseUrl = process.env.AI_INTEGRATIONS_GROQ_BASE_URL || "https://api.groq.com/openai/v1";
      const aiResponse = await fetch(
        `${groqBaseUrl}/chat/completions`,
        {
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
                content:
                  "You are a helpful assistant analyzing documents. Provide detailed insights based on the content provided. If the content looks like binary data or garbage, try to identify the file type and explain what it might be.",
              },
              {
                role: "user",
                content: `${body.prompt}\n\nDocument: "${fileName}"\n\n${truncatedContent}`,
              },
            ],
            max_tokens: body.maxTokens || 2000,
          }),
        },
      );

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error("Groq API error:", errorText);
        throw new Error(`AI analysis failed: ${aiResponse.status} ${aiResponse.statusText}`);
      }

      const aiResult = await aiResponse.json() as any;
      const analysis =
        aiResult.choices?.[0]?.message?.content || "No analysis available";

      console.log(`[AI Analyze] Success: Analysis generated (${analysis.length} chars)`);
      res.json({
        fileId,
        fileName,
        analysis,
        contentLength: content.length,
      });
      return;
    } catch (error) {
      console.error("Failed to analyze file:", error);
      res.status(500).json({ error: "Failed to analyze file" });
      return;
    }
  },
);

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
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    if (integration.provider !== "google_drive") {
      res.status(400).json({ error: "Only Google Drive supports this operation" });
      return;
    }

    // Generate content with AI
    const groqBaseUrl = process.env.AI_INTEGRATIONS_GROQ_BASE_URL || "https://api.groq.com/openai/v1";
    const aiResponse = await fetch(
      `${groqBaseUrl}/chat/completions`,
      {
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
              content: `You are a helpful assistant creating ${body.type} content. Generate well-formatted, professional content.`,
            },
            { role: "user", content: body.prompt },
          ],
          max_tokens: 4000,
        }),
      },
    );

    if (!aiResponse.ok) {
      throw new Error("AI content generation failed");
    }

    const aiResult = await aiResponse.json() as any;
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Create Google Doc with the content
    // First, create an empty doc
    const createResponse = await fetch(
      "https://www.googleapis.com/drive/v3/files",
      {
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
      },
    );

    if (!createResponse.ok) {
      throw new Error("Failed to create Google Doc");
    }

    const doc = await createResponse.json() as any;

    // Note: To actually insert content, we'd need to use the Docs API
    // For now, return the created doc info and content separately
    res.json({
      id: doc.id,
      name: body.title,
      type: "document",
      content,
      message:
        "Document created. Content is ready to be copied into the document.",
    });
    return;
  } catch (error) {
    console.error("Failed to create AI document:", error);
    res.status(500).json({ error: "Failed to create document" });
    return;
  }
});

// ============== AI AGENT TOOLS ==============

// GET /cloud/integrations/:id/ai-tools - Get available AI tools for this integration
router.get("/cloud/integrations/:id/ai-tools", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  if (isNaN(integrationId)) {
    res.status(400).json({ error: "Invalid integration ID" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found" });
      return;
    }

    const tools = [
      {
        name: "list_files",
        description: "List files and folders in Google Drive",
        parameters: {
          folderId: {
            type: "string",
            description: "Optional folder ID to list contents of",
          },
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
          parentId: {
            type: "string",
            description: "Optional parent folder ID",
          },
        },
      },
      {
        name: "create_document",
        description: "Create a new document with AI-generated content",
        parameters: {
          title: { type: "string", description: "Title of the document" },
          content: { type: "string", description: "Content for the document" },
          parentId: {
            type: "string",
            description: "Optional parent folder ID",
          },
        },
      },
      {
        name: "move_file",
        description: "Move a file to a different folder",
        parameters: {
          fileId: { type: "string", description: "ID of the file to move" },
          folderId: {
            type: "string",
            description: "ID of the destination folder",
          },
        },
      },
      {
        name: "analyze_file",
        description: "Analyze a file with AI and provide insights",
        parameters: {
          fileId: { type: "string", description: "ID of the file to analyze" },
          question: {
            type: "string",
            description: "Specific question about the file",
          },
        },
      },
    ];

    res.json({ integrationId, provider: integration.provider, tools });
  } catch (error) {
    console.error("Failed to fetch AI tools:", error);
    res.status(500).json({ error: "Failed to fetch tools" });
    return;
  }
});

// Helper to perform export (recursively if it's a page/folder)
async function performExport(
  userId: string,
  integration: any,
  sourceId: number,
  isPage: boolean,
  targetFolderId?: string,
): Promise<{ success: boolean; providerFileId?: string }> {
  console.log(
    `[Export] Starting export for ${isPage ? "page" : "source"} ${sourceId} to ${integration.provider}. Target: ${targetFolderId || "root"}`,
  );

  let fileName: string;
  let fileBuffer: Buffer | null = null;
  let mimeType: string;
  let isFolder = false;

  try {
    if (isPage) {
      const [page] = await db
        .select()
        .from(pagesTable)
        .where(and(eq(pagesTable.id, sourceId), eq(pagesTable.userId, userId)));
      if (!page) throw new Error(`Page ${sourceId} not found`);
      fileName = page.title;
      mimeType = "application/vnd.google-apps.folder";
      isFolder = true;
    } else {
      const [source] = await db
        .select()
        .from(sourcesTable)
        .where(
          and(eq(sourcesTable.id, sourceId), eq(sourcesTable.userId, userId)),
        );
      if (!source) throw new Error(`Source ${sourceId} not found`);

      fileName = source.title;
      mimeType = source.mediaMimeType || "text/plain";

      if (source.mediaPath) {
        console.log(`[Export] Fetching media from ${source.mediaPath}`);
        const response = await fetch(source.mediaPath);
        if (!response.ok)
          throw new Error(
            `Failed to fetch media from storage (${response.status} ${response.statusText})`,
          );
        fileBuffer = Buffer.from(await response.arrayBuffer());
      } else {
        fileBuffer = Buffer.from(source.content || "");
        if (!fileName.includes(".")) fileName += ".txt";
        mimeType = "text/plain";
      }
    }

    let providerFileId: string | undefined;

    if (integration.provider === "google_drive") {
      const metadata: any = {
        name: fileName,
        parents: targetFolderId ? [targetFolderId] : undefined,
      };

      if (isFolder) {
        metadata.mimeType = "application/vnd.google-apps.folder";
        console.log(`[Export] Creating Google Drive folder: ${fileName}`);
        const response = await fetch(
          "https://www.googleapis.com/drive/v3/files",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(metadata),
          },
        );

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Google Drive folder creation failed: ${err}`);
        }
        const result = await response.json() as any;
        providerFileId = result.id;
      } else {
        console.log(
          `[Export] Uploading file to Google Drive: ${fileName} (${mimeType})`,
        );
        // Google Drive multipart/related upload
        const boundary = "-------eden_export_boundary";
        const delimiter = "\r\n--" + boundary + "\r\n";
        const closeDelimiter = "\r\n--" + boundary + "--";

        const metadataPart =
          "Content-Type: application/json\r\n\r\n" + JSON.stringify(metadata);
        const mediaPart = `Content-Type: ${mimeType}\r\nContent-Transfer-Encoding: base64\r\n\r\n${fileBuffer?.toString("base64")}`;

        const multipartBody =
          delimiter + metadataPart + delimiter + mediaPart + closeDelimiter;

        const response = await fetch(
          "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Content-Type": `multipart/related; boundary=${boundary}`,
            },
            body: multipartBody,
          },
        );

        if (!response.ok) {
          const err = await response.text();
          throw new Error(`Google Drive upload failed: ${err}`);
        }
        const result = await response.json() as any;
        providerFileId = result.id;
      }
    } else if (integration.provider === "dropbox") {
      const path =
        (!targetFolderId || targetFolderId === "/" ? "" : targetFolderId) +
        "/" +
        fileName;

      if (isFolder) {
        console.log(`[Export] Creating Dropbox folder: ${path}`);
        const response = await fetch(
          "https://api.dropboxapi.com/2/files/create_folder_v2",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ path, autorename: true }),
          },
        );
        if (!response.ok)
          throw new Error(
            `Dropbox folder creation failed: ${await response.text()}`,
          );
        const result = await response.json() as any;
        providerFileId = result.metadata.path_display;
      } else {
        console.log(`[Export] Uploading file to Dropbox: ${path}`);
        const response = await fetch(
          "https://content.dropboxapi.com/2/files/upload",
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${integration.accessToken}`,
              "Dropbox-API-Arg": JSON.stringify({
                path,
                mode: "add",
                autorename: true,
              }),
              "Content-Type": "application/octet-stream",
            },
            body: fileBuffer,
          },
        );
        if (!response.ok)
          throw new Error(`Dropbox upload failed: ${await response.text()}`);
        const result = await response.json() as any;
        providerFileId = result.path_display;
      }
    }

    // Recursive step: if it's a folder, export all children
    if (isFolder && providerFileId) {
      console.log(
        `[Export] Recursively exporting contents of ${fileName} to ${providerFileId}`,
      );
      // Export children sources
      const sources = await db
        .select()
        .from(sourcesTable)
        .where(
          and(
            eq(sourcesTable.parentPageId, sourceId),
            eq(sourcesTable.userId, userId),
          ),
        );
      for (const source of sources) {
        await performExport(
          userId,
          integration,
          source.id,
          false,
          providerFileId,
        );
      }

      // Export children pages
      const pages = await db
        .select()
        .from(pagesTable)
        .where(
          and(eq(pagesTable.parentId, sourceId), eq(pagesTable.userId, userId)),
        );
      for (const childPage of pages) {
        await performExport(
          userId,
          integration,
          childPage.id,
          true,
          providerFileId,
        );
      }
    }

    return { success: true, providerFileId };
  } catch (error) {
    console.error(
      `[Export Error] ${isPage ? "Page" : "Source"} ${sourceId}:`,
      error,
    );
    throw error;
  }
}

// POST /cloud/integrations/:id/export - Export Eden source to cloud storage
router.post("/cloud/integrations/:id/export", async (req, res) => {
  const user = (req as any).user;
  const integrationId = parseInt(req.params.id);

  const schema = z.object({
    sourceId: z.number(),
    targetFolderId: z.string().optional(),
    isPage: z.boolean().default(false),
  });

  let body;
  try {
    body = schema.parse(req.body);
  } catch (error) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  try {
    const [integration] = await db
      .select()
      .from(cloudIntegrationsTable)
      .where(
        and(
          eq(cloudIntegrationsTable.id, integrationId),
          eq(cloudIntegrationsTable.userId, user.id),
          eq(cloudIntegrationsTable.isActive, true),
        ),
      );

    if (!integration) {
      res.status(404).json({ error: "Integration not found or inactive" });
      return;
    }

    const result = await performExport(
      user.id,
      integration,
      body.sourceId,
      body.isPage,
      body.targetFolderId,
    );
    res.json(result);
    return;
  } catch (error) {
    console.error("Export to cloud failed:", error);
    res.status(500).json({
      error:
        error instanceof Error ? error.message : "Failed to export to cloud",
    });
    return;
  }
});

async function listNotionItems(accessToken: string) {
  const response = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Notion-Version": "2022-06-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      sort: {
        direction: "descending",
        timestamp: "last_edited_time",
      },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Notion search failed: ${error}`);
  }

  const data = await response.json();
  return (data as any).results.map((item: any) => ({
    id: item.id,
    name: item.properties?.title?.title?.[0]?.plain_text || 
          item.properties?.Name?.title?.[0]?.plain_text || 
          item.title?.[0]?.plain_text || 
          "Untitled",
    type: "file", // We treat pages/databases as files for import purposes
    mimeType: item.object === "page" ? "application/vnd.notion-page" : "application/vnd.notion-database",
    modifiedAt: item.last_edited_time,
  }));
}

export default router;
export { listGoogleDriveFiles, listDropboxFiles };
