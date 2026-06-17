import { Router, type IRouter } from "express";
import {
  SearchPropertiesBody,
  GetPropertyParams,
} from "@workspace/api-zod";
import {
  parsePromptToFilters,
  scoreProperties,
  generateSearchSummary,
} from "../../lib/propertySearch";
import {
  searchCanadianListings,
  getFeaturedCanadianListings,
  getStoredProperty,
  hasFirecrawl,
} from "../../lib/firecrawlSearch";
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
  const properties = await searchCanadianListings(filters, resultCount);

  const scored = scoreProperties(properties, filters);

  let summary: string;
  if (scored.length > 0) {
    // The AI summary is a nicety — never let it discard real listings.
    try {
      summary = await generateSearchSummary(prompt, filters, scored.length);
    } catch (err) {
      req.log.warn({ err }, "Search summary generation failed; using fallback");
      summary = `Found ${scored.length} live listings matching "${filters.location ?? prompt}".`;
    }
  } else if (!hasFirecrawl()) {
    summary =
      "Live listings are unavailable because the data provider isn't configured. Please add a Firecrawl API key.";
  } else {
    summary = `We couldn't find live listings for "${filters.location ?? prompt}" right now. Try a major Canadian city (e.g. Toronto, Vancouver, Calgary) or broaden your criteria.`;
  }

  // Persisting the search for "trending" is a side effect — failure here must
  // not turn a successful real-listing search into a 500.
  try {
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
  } catch (err) {
    req.log.warn({ err }, "Failed to persist search history; continuing");
  }

  res.json({
    properties: scored,
    totalCount: scored.length,
    searchSummary: summary,
    parsedFilters: filters,
  });
});

router.get("/properties/featured", async (req, res): Promise<void> => {
  const featured = (await getFeaturedCanadianListings(6)).map((p, i) => ({
    ...p,
    matchScore: 99 - i,
  }));
  req.log.info({ count: featured.length }, "Featured listings served");
  res.json(featured);
});

router.get("/properties/trending", async (_req, res): Promise<void> => {
  const trending = await db
    .select()
    .from(searchesTable)
    .orderBy(desc(searchesTable.count))
    .limit(8);

  const fallback = [
    { query: "Detached house in Toronto under $1.2M", count: 142, location: "Toronto, ON" },
    { query: "2BR condo downtown Vancouver", count: 98, location: "Vancouver, BC" },
    { query: "4BR house with good schools in Mississauga", count: 87, location: "Mississauga, ON" },
    { query: "Modern condo in Calgary under $600K", count: 76, location: "Calgary, AB" },
    { query: "Townhouse in Ottawa near transit", count: 65, location: "Ottawa, ON" },
    { query: "Family home in Burnaby with a yard", count: 54, location: "Burnaby, BC" },
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

  const property = getStoredProperty(id);
  if (property) {
    res.json(property);
    return;
  }

  res.status(404).json({ error: "Property not found" });
});

export default router;
