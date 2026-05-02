import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { signToken } from "../lib/auth";
import { z } from "zod";

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
      return res.status(400).json({ error: "User already exists" });
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
  }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = AuthSchema.parse(req.body);

    const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
    if (!user || !user.password) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: "Invalid credentials" });
    }

    const token = signToken({ id: user.id, email: user.email });
    res.json({ token, user: { id: user.id, email: user.email } });
  } catch (err) {
    res.status(400).json({ error: "Invalid data" });
  }
});

export default router;
