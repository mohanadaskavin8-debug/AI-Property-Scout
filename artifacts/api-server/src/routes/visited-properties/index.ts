import { Router, type IRouter } from "express";
import { RecordVisitedPropertyBody } from "@workspace/api-zod";
import { db, visitedPropertiesTable } from "@workspace/db";
import { eq, and, desc, sql } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";

const router: IRouter = Router();

type VisitedRow = typeof visitedPropertiesTable.$inferSelect;

function serialize(row: VisitedRow) {
  return {
    id: row.id,
    propertyData: row.propertyData,
    visitCount: row.visitCount,
    firstVisitedAt: row.firstVisitedAt.toISOString(),
    lastVisitedAt: row.lastVisitedAt.toISOString(),
  };
}

router.get("/visited-properties", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(visitedPropertiesTable)
    .where(eq(visitedPropertiesTable.userId, userId))
    .orderBy(desc(visitedPropertiesTable.lastVisitedAt));
  res.json(rows.map(serialize));
});

router.post("/visited-properties", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = RecordVisitedPropertyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const propertyData = parsed.data.propertyData;
  const propertyId = propertyData.id;

  // Upsert so repeated views bump the counter / recency instead of inserting
  // duplicate rows.
  const [row] = await db
    .insert(visitedPropertiesTable)
    .values({ userId, propertyId, propertyData })
    .onConflictDoUpdate({
      target: [visitedPropertiesTable.userId, visitedPropertiesTable.propertyId],
      set: {
        propertyData,
        visitCount: sql`${visitedPropertiesTable.visitCount} + 1`,
        lastVisitedAt: new Date(),
      },
    })
    .returning();

  res.json(serialize(row));
});

export default router;
