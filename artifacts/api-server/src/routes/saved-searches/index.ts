import { Router, type IRouter } from "express";
import {
  CreateSavedSearchBody,
  DeleteSavedSearchParams,
  RunSavedSearchParams,
} from "@workspace/api-zod";
import { db, savedSearchesTable } from "@workspace/db";
import { eq, and, desc } from "drizzle-orm";
import { requireAuth } from "../../middlewares/auth";
import {
  parsePromptToFilters,
  scoreProperties,
  generateSearchSummary,
} from "../../lib/propertySearch";
import { searchCanadianListings, hasFirecrawl } from "../../lib/firecrawlSearch";

const router: IRouter = Router();

type SavedSearchRow = typeof savedSearchesTable.$inferSelect;

function serialize(row: SavedSearchRow) {
  return {
    id: row.id,
    name: row.name,
    query: row.query,
    parsedFilters: row.parsedFilters ?? undefined,
    alertEnabled: row.alertEnabled,
    lastRunAt: row.lastRunAt ? row.lastRunAt.toISOString() : null,
    lastResultCount: row.lastResultCount,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

router.get("/saved-searches", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const rows = await db
    .select()
    .from(savedSearchesTable)
    .where(eq(savedSearchesTable.userId, userId))
    .orderBy(desc(savedSearchesTable.updatedAt));
  res.json(rows.map(serialize));
});

router.post("/saved-searches", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const parsed = CreateSavedSearchBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const query = parsed.data.query.trim();
  if (!query) {
    res.status(400).json({ error: "Query cannot be empty" });
    return;
  }
  const queryNormalized = normalizeQuery(query);

  // Dedupe per user on the normalized query: saving the same search again just
  // refreshes its metadata instead of creating a duplicate row.
  const [row] = await db
    .insert(savedSearchesTable)
    .values({
      userId,
      name: parsed.data.name ?? null,
      query,
      queryNormalized,
      parsedFilters: parsed.data.parsedFilters ?? null,
      alertEnabled: parsed.data.alertEnabled ?? false,
    })
    .onConflictDoUpdate({
      target: [savedSearchesTable.userId, savedSearchesTable.queryNormalized],
      set: {
        name: parsed.data.name ?? null,
        query,
        parsedFilters: parsed.data.parsedFilters ?? null,
        alertEnabled: parsed.data.alertEnabled ?? false,
        updatedAt: new Date(),
      },
    })
    .returning();

  res.status(201).json(serialize(row));
});

router.delete("/saved-searches/:id", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = DeleteSavedSearchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [deleted] = await db
    .delete(savedSearchesTable)
    .where(
      and(eq(savedSearchesTable.id, params.data.id), eq(savedSearchesTable.userId, userId)),
    )
    .returning();

  if (!deleted) {
    res.status(404).json({ error: "Saved search not found" });
    return;
  }
  res.sendStatus(204);
});

router.post("/saved-searches/:id/run", requireAuth, async (req, res): Promise<void> => {
  const userId = req.userId!;
  const params = RunSavedSearchParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid ID" });
    return;
  }

  const [saved] = await db
    .select()
    .from(savedSearchesTable)
    .where(
      and(eq(savedSearchesTable.id, params.data.id), eq(savedSearchesTable.userId, userId)),
    )
    .limit(1);

  if (!saved) {
    res.status(404).json({ error: "Saved search not found" });
    return;
  }

  const filters = await parsePromptToFilters(saved.query);
  const properties = await searchCanadianListings(filters, 20);
  const scored = scoreProperties(properties, filters);

  let summary: string;
  if (scored.length > 0) {
    try {
      summary = await generateSearchSummary(saved.query, filters, scored.length);
    } catch (err) {
      req.log.warn({ err }, "Saved-search summary generation failed; using fallback");
      summary = `Found ${scored.length} live listings matching "${filters.location ?? saved.query}".`;
    }
  } else if (!hasFirecrawl()) {
    summary =
      "Live listings are unavailable because the data provider isn't configured.";
  } else {
    summary = `No live listings for "${filters.location ?? saved.query}" right now. Try broadening your criteria.`;
  }

  // Record the run honestly so the UI can show "last run" + count.
  try {
    await db
      .update(savedSearchesTable)
      .set({
        parsedFilters: filters,
        lastRunAt: new Date(),
        lastResultCount: scored.length,
      })
      .where(eq(savedSearchesTable.id, saved.id));
  } catch (err) {
    req.log.warn({ err }, "Failed to persist saved-search run metadata; continuing");
  }

  res.json({
    properties: scored,
    totalCount: scored.length,
    searchSummary: summary,
    parsedFilters: filters,
  });
});

export default router;
