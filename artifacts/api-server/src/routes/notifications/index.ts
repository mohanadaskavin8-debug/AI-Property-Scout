import { Router, type IRouter } from "express";
import { MarkNotificationReadParams } from "@workspace/api-zod";
import { db, notificationsTable } from "@workspace/db";
import { eq, and, desc, isNull, count } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

type NotificationRow = typeof notificationsTable.$inferSelect;

function serialize(row: NotificationRow) {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    href: row.href,
    readAt: row.readAt ? row.readAt.toISOString() : null,
    createdAt: row.createdAt.toISOString(),
  };
}

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(eq(notificationsTable.userId, userId))
    .orderBy(desc(notificationsTable.createdAt))
    .limit(50);
  res.json(rows.map(serialize));
});

router.get("/notifications/unread-count", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const [row] = await db
    .select({ value: count() })
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)));
  res.json({ count: row?.value ?? 0 });
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(and(eq(notificationsTable.userId, userId), isNull(notificationsTable.readAt)));
  res.sendStatus(204);
});

router.post("/notifications/:id/read", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = MarkNotificationReadParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [updated] = await db
    .update(notificationsTable)
    .set({ readAt: new Date() })
    .where(
      and(eq(notificationsTable.id, params.data.id), eq(notificationsTable.userId, userId)),
    )
    .returning();

  if (!updated) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }
  res.sendStatus(204);
});

export default router;
