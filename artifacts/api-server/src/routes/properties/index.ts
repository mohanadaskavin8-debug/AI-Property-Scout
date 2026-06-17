import { Router, type IRouter } from "express";
import {
  SearchPropertiesBody,
  GetPropertyParams,
} from "@workspace/api-zod";
import {
  parsePromptToFilters,
  searchZillow,
  scoreProperties,
  generateSearchSummary,
  getSampleProperties,
} from "../../lib/propertySearch";
import { db } from "@workspace/db";
import { searchesTable } from "@workspace/db";
import { eq, desc } from "drizzle-orm";
import { logger } from "../../lib/logger";

const router: IRouter = Router();

router.post("/properties/search", async (req, res): Promise<void> => {
  const parsed = SearchPropertiesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const { prompt, maxResults = 20 } = parsed.data;

  req.log.info({ prompt }, "Property search started");

  const filters = await parsePromptToFilters(prompt);
  req.log.info({ filters }, "Parsed search filters");

  const resultCount = maxResults ?? 20;
  let properties = await searchZillow(filters, resultCount);

  if (properties.length === 0) {
    req.log.info("No Zillow results, using sample data");
    properties = getSampleProperties(filters.location ?? "New York", resultCount);
  }

  const scored = scoreProperties(properties, filters);
  const summary = await generateSearchSummary(prompt, filters, scored.length);

  const location = filters.location ?? prompt.slice(0, 100);
  const existing = await db
    .select()
    .from(searchesTable)
    .where(eq(searchesTable.query, prompt))
    .limit(1);

  if (existing.length > 0) {
    await db
      .update(searchesTable)
      .set({ count: (existing[0].count ?? 0) + 1 })
      .where(eq(searchesTable.id, existing[0].id));
  } else {
    await db.insert(searchesTable).values({ query: prompt, location, count: 1 });
  }

  res.json({
    properties: scored,
    totalCount: scored.length,
    searchSummary: summary,
    parsedFilters: filters,
  });
});

router.get("/properties/featured", async (_req, res): Promise<void> => {
  const featured = getSampleProperties("San Francisco", 6).map((p) => ({
    ...p,
    matchScore: 95 + Math.floor(Math.random() * 5),
  }));
  res.json(featured);
});

router.get("/properties/trending", async (_req, res): Promise<void> => {
  const trending = await db
    .select()
    .from(searchesTable)
    .orderBy(desc(searchesTable.count))
    .limit(8);

  const fallback = [
    { query: "Modern house with pool in Miami", count: 142, location: "Miami, FL" },
    { query: "2BR condo downtown NYC under $1.5M", count: 98, location: "New York, NY" },
    { query: "4BR house good schools Austin TX", count: 87, location: "Austin, TX" },
    { query: "Beachfront property Florida", count: 76, location: "Florida" },
    { query: "Modern loft Seattle under $800K", count: 65, location: "Seattle, WA" },
    { query: "Mountain view house Denver", count: 54, location: "Denver, CO" },
  ];

  const results =
    trending.length > 0
      ? trending.map((s) => ({ query: s.query, count: s.count, location: s.location }))
      : fallback;

  res.json(results);
});

router.get("/properties/:id", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid property ID" });
    return;
  }

  const { id } = params.data;

  if (id.startsWith("sample-") || id.startsWith("zillow-")) {
    const index = parseInt(id.split("-")[1], 10);
    const properties = getSampleProperties("San Francisco", 20);
    const property = properties[index % properties.length];
    if (property) {
      res.json({ ...property, id });
      return;
    }
  }

  res.status(404).json({ error: "Property not found" });
});

export default router;
