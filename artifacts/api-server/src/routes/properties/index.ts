import { Router, type IRouter } from "express";
import {
  SearchPropertiesBody,
  GetPropertyParams,
  GetGeocodeStatusBody,
} from "@workspace/api-zod";
import {
  parsePromptToFilters,
  scoreProperties,
  generateSearchSummary,
  type ParsedFilters,
  type QueryPlan,
} from "../../lib/propertySearch";
import {
  searchCanadianListings,
  getFeaturedCanadianListings,
  getStoredProperty,
  enrichStoredProperty,
  placeFromCityMap,
  hasFirecrawl,
} from "../../lib/firecrawlSearch";
import { getGeocodeStatus, resolvePlace, type ResolvedPlace } from "../../lib/geocode";
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

  const plan = await parsePromptToFilters(prompt);
  req.log.info({ plan }, "Parsed search plan");

  const resultCount = maxResults ?? 20;

  // Resolve the place to a REAL Canadian area — the geographic source of truth.
  // The LLM is NEVER trusted to pick the city. If the user named a place we
  // can't pin, we honestly return nothing rather than guess a wrong city.
  let place: ResolvedPlace | null = null;
  let locationNote: string | null = null;

  if (plan.location) {
    place = (await resolvePlace(plan.location)) ?? placeFromCityMap(plan.location);
    if (!place) {
      req.log.info({ location: plan.location }, "Could not resolve requested place");
      res.json({
        properties: [],
        totalCount: 0,
        searchSummary: `We couldn't pinpoint "${plan.location}" in Canada. Try a city, neighbourhood, postal code (FSA), or a nearby landmark — or rephrase the location.`,
        parsedFilters: toPublicFilters(plan, null),
      });
      return;
    }
  } else {
    // No location given: default to Toronto, but DISCLOSE it (honest, not silent).
    place = (await resolvePlace("Toronto, Ontario")) ?? placeFromCityMap("Toronto");
    locationNote =
      "Showing Toronto — add a city, neighbourhood, or landmark to focus your search.";
  }

  // Honest "near" disclosure: the user asked for "near X" but we could only
  // resolve the surrounding area (not the exact point), so walking-distance
  // proximity can't be applied — say so instead of implying it.
  if (plan.isNear && plan.location && place && !place.precise) {
    locationNote = `We couldn't pinpoint the exact spot near "${plan.location}", so we're showing listings across ${place.displayName}. Add a specific landmark, intersection, or postal code to narrow to walking distance.`;
  }

  const properties = place ? await searchCanadianListings(plan, place, resultCount) : [];
  const scored = scoreProperties(properties, plan);

  let summary: string;
  if (scored.length > 0) {
    // The AI summary is a nicety — never let it discard real listings.
    try {
      summary = await generateSearchSummary(prompt, toPublicFilters(plan, place), scored.length);
    } catch (err) {
      req.log.warn({ err }, "Search summary generation failed; using fallback");
      summary = `Found ${scored.length} live listings in ${place?.displayName ?? "Canada"}.`;
    }
    if (locationNote) summary = `${locationNote} ${summary}`;
  } else if (!hasFirecrawl()) {
    summary =
      "Live listings are unavailable because the data provider isn't configured. Please add a Firecrawl API key.";
  } else if (plan.isNear && place && place.precise) {
    summary = `We couldn't find live listings within walking distance of ${place.displayName} that match your criteria right now. Try widening your budget or area, or drop "near" to search the surrounding neighbourhood.`;
  } else {
    summary = `We couldn't find live listings in ${place?.displayName ?? "that area"} right now. Try broadening your criteria or searching a nearby area.`;
  }

  // Persisting the search for "trending" is a side effect — failure here must
  // not turn a successful real-listing search into a 500.
  try {
    const location = place?.displayName ?? plan.location ?? prompt.slice(0, 100);
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
    parsedFilters: toPublicFilters(plan, place),
  });
});

/** Map the internal QueryPlan back to the public ParsedFilters response shape. */
function toPublicFilters(plan: QueryPlan, place: ResolvedPlace | null): ParsedFilters {
  return {
    location: place?.displayName ?? plan.location,
    minPrice: plan.minPrice,
    maxPrice: plan.maxPrice,
    minBedrooms: plan.minBedrooms,
    minBathrooms: plan.minBathrooms,
    propertyType: plan.propertyType,
    minSqft: plan.minSqft,
    maxSqft: plan.maxSqft,
    keywords: plan.keywords,
  };
}

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

// Polled by the map to resolve coordinates for listings that were still
// "pending" geocoding at search time. Public (browsing is open).
router.post("/properties/geocode-status", async (req, res): Promise<void> => {
  const parsed = GetGeocodeStatusBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const ids = parsed.data.ids.slice(0, 100);
  const statuses = await getGeocodeStatus(ids);
  res.json(statuses);
});

router.get("/properties/:id", async (req, res): Promise<void> => {
  const params = GetPropertyParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: "Invalid property ID" });
    return;
  }

  const { id } = params.data;

  if (!getStoredProperty(id)) {
    res.status(404).json({ error: "Property not found" });
    return;
  }

  // Enrich with REAL detail-page data (description, year built, MLS #, full
  // photo gallery, etc.) scraped on demand and cached. Best-effort: if the
  // scrape yields nothing, the listing's known fields are served as-is and the
  // UI honestly shows "Not available" for what we couldn't verify.
  try {
    await enrichStoredProperty(id);
  } catch (err) {
    req.log.warn({ err, id }, "Detail enrichment failed; serving base listing");
  }

  const enriched = getStoredProperty(id);
  if (!enriched) {
    res.status(404).json({ error: "Property not found" });
    return;
  }
  res.json(enriched);
});

export default router;
