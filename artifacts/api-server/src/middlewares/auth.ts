import type { Request, Response, NextFunction } from "express";
import { getAuth, clerkClient } from "@clerk/express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "../lib/logger";

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      userId?: string;
    }
  }
}

/**
 * Just-in-time user provisioning. The first time we see an authenticated user
 * we copy a snapshot of their Clerk profile into our own `users` table so that
 * features like NestlyGroup can look members up by id/email without hitting
 * Clerk on every request. Best-effort: never blocks the request.
 */
export async function ensureUserRow(userId: string) {
  try {
    const existing = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    if (existing.length > 0) return existing[0];

    let email: string | null = null;
    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const u = await clerkClient.users.getUser(userId);
      email =
        u.primaryEmailAddress?.emailAddress ??
        u.emailAddresses?.[0]?.emailAddress ??
        null;
      const name = [u.firstName, u.lastName].filter(Boolean).join(" ").trim();
      displayName = name || u.username || null;
      avatarUrl = u.imageUrl ?? null;
    } catch (err) {
      logger.error({ err, userId }, "Failed to fetch Clerk user during provisioning");
    }

    const [row] = await db
      .insert(usersTable)
      .values({ id: userId, email, displayName, avatarUrl })
      .onConflictDoNothing()
      .returning();
    if (row) return row;

    const after = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.id, userId))
      .limit(1);
    return after[0];
  } catch (err) {
    logger.error({ err, userId }, "ensureUserRow failed");
    return undefined;
  }
}

/**
 * Rejects unauthenticated requests. On success, attaches the Clerk user id to
 * `req.userId`. Always derive identity from here — never trust a user id passed
 * in the request body or query.
 */
export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const auth = getAuth(req);
  const userId = auth?.userId;
  if (!userId) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  req.userId = userId;
  void ensureUserRow(userId);
  next();
}
