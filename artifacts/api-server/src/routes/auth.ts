import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken } from "../lib/auth";
import { z } from "zod";
import { OAuth2Client } from "google-auth-library";

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

const router = Router();

const AuthSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
});

router.post("/signup", async (req, res) => {
  try {
    const { email, password } = AuthSchema.parse(req.body);

    const [existing] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (existing) {
      res.status(400).json({ error: "User already exists" });
      return;
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const id = crypto.randomUUID();

    const [user] = await db.insert(usersTable).values({
      id,
      email,
      password: passwordHash,
    }).returning();

    const token = signToken({ id: user!.id, email: user!.email });
    res.status(201).json({ token, user: { id: user!.id, email: user!.email } });
  } catch (err) {
    res.status(400).json({ error: "Invalid data" });
    return;
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = AuthSchema.parse(req.body);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user || !user.password) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      res.status(401).json({ error: "Invalid credentials" });
      return;
    }

    const token = signToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(400).json({ error: "Invalid data" });
    return;
  }
});

router.post("/google", async (req, res) => {
  console.log("[Auth:Google] Received request:", req.body);
  try {
    const { email, name, picture, googleId } = z.object({ 
      email: z.string().email(),
      name: z.string().optional(),
      picture: z.string().optional(),
      googleId: z.string().optional()
    }).parse(req.body);

    console.log("[Auth:Google] Searching for user:", email);
    // Find or create user
    let [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));

    if (!user) {
      console.log("[Auth:Google] Creating new user:", email);
      [user] = await db.insert(usersTable).values({
        id: crypto.randomUUID(),
        email,
        name: name || null,
        image: picture || null,
      }).returning();
    }

    console.log("[Auth:Google] User found/created:", user.id);
    const token = signToken({ id: user!.id, email: user!.email });
    res.json({ token, user: { id: user!.id, email: user!.email, name, picture } });
  } catch (err) {
    console.error("[Auth:Google] Error:", err);
    res.status(400).json({ error: "Google authentication failed" });
  }
});

export default router;
