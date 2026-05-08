import { Router, type IRouter } from "express";
import { db, emailIntegrationsTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { authenticate } from "../lib/auth";
import { z } from "zod";

const router: IRouter = Router();

const emailSettingsSchema = z.object({
  provider: z.enum(["resend", "smtp"]),
  resendApiKey: z.string().optional(),
  smtpHost: z.string().optional(),
  smtpPort: z.number().optional(),
  smtpUser: z.string().optional(),
  smtpPass: z.string().optional(),
  smtpFrom: z.string().email().optional(),
});

// GET /settings/email - Get user's email integration settings
router.get("/email", authenticate, async (req, res) => {
  const user = (req as any).user;

  try {
    const [settings] = await db
      .select()
      .from(emailIntegrationsTable)
      .where(eq(emailIntegrationsTable.userId, user.id));

    if (!settings) {
      res.json(null);
      return;
    }

    // Mask sensitive info
    const response = {
      ...settings,
      resendApiKey: settings.resendApiKey ? "****" + settings.resendApiKey.slice(-4) : null,
      smtpPass: settings.smtpPass ? "********" : null,
    };

    res.json(response);
  } catch (error) {
    console.error("Failed to fetch email settings:", error);
    res.status(500).json({ error: "Failed to fetch email settings" });
  }
});

// POST /settings/email - Update user's email integration settings
router.post("/email", authenticate, async (req, res) => {
  const user = (req as any).user;

  try {
    const data = emailSettingsSchema.parse(req.body);

    const [existing] = await db
      .select()
      .from(emailIntegrationsTable)
      .where(eq(emailIntegrationsTable.userId, user.id));

    if (existing) {
      // If passing masked values, don't update those fields
      const updates: any = { ...data };
      if (data.resendApiKey?.includes("****")) delete updates.resendApiKey;
      if (data.smtpPass === "********") delete updates.smtpPass;

      await db
        .update(emailIntegrationsTable)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(emailIntegrationsTable.userId, user.id));
    } else {
      await db
        .insert(emailIntegrationsTable)
        .values({
          userId: user.id,
          ...data,
        });
    }

    res.json({ success: true });
  } catch (error) {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid data", details: error.errors });
      return;
    }
    console.error("Failed to update email settings:", error);
    res.status(500).json({ error: "Failed to update email settings" });
  }
});

export default router;
