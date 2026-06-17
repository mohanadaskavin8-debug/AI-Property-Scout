import { logger } from "./logger";
import type { ParsedFilters, PropertyResult } from "./propertySearch";

const FIRECRAWL_API_KEY = process.env.FIRECRAWL_API_KEY;
const FIRECRAWL_BASE = "https://api.firecrawl.dev/v1";

export function hasFirecrawl(): boolean {
  return Boolean(FIRECRAWL_API_KEY);
}

interface ExtractedListing {
  address?: string;
  city?: string;
  province?: string;
  postalCode?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  propertyType?: string;
  imageUrl?: string;
  listingUrl?: string;
}

const LISTING_SCHEMA = {
  type: "object",
  properties: {
    listings: {
      type: "array",
      items: {
        type: "object",
        properties: {
          address: { type: "string" },
          city: { type: "string" },
          province: { type: "string" },
          postalCode: { type: "string" },
          price: { type: "number" },
          bedrooms: { type: "number" },
          bathrooms: { type: "number" },
          sqft: { type: "number" },
          propertyType: { type: "string" },
          imageUrl: { type: "string" },
          listingUrl: { type: "string" },
        },
      },
    },
  },
  required: ["listings"],
};

const EXTRACT_PROMPT =
  "Extract every real estate property listing visible on this page. For each listing capture: the street address, city, province, postal code, the asking price in Canadian dollars as a plain number (no $ or commas), number of bedrooms, number of bathrooms, interior square footage as a number, the property type (house, condo, townhouse, etc.), the absolute URL of the main listing photo, and the absolute URL of the listing detail page. Only include genuine property listings, not ads or navigation.";

// ---- caching to conserve Firecrawl credits ----
const scrapeCache = new Map<string, { listings: ExtractedListing[]; expires: number }>();
const SCRAPE_TTL_MS = 30 * 60 * 1000; // 30 min

// in-memory store so property detail pages can look up real listings
const propertyStore = new Map<string, PropertyResult>();

export function getStoredProperty(id: string): PropertyResult | undefined {
  return propertyStore.get(id);
}

function rememberProperties(props: PropertyResult[]): void {
  for (const p of props) propertyStore.set(p.id, p);
}

async function firecrawlScrape(url: string): Promise<ExtractedListing[]> {
  if (!FIRECRAWL_API_KEY) {
    logger.warn("FIRECRAWL_API_KEY not configured; cannot fetch live listings");
    return [];
  }

  const cached = scrapeCache.get(url);
  if (cached && cached.expires > Date.now()) {
    logger.info({ url, count: cached.listings.length }, "Firecrawl cache hit");
    return cached.listings;
  }

  try {
    const res = await fetch(`${FIRECRAWL_BASE}/scrape`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify({
        url,
        formats: ["json"],
        onlyMainContent: false,
        waitFor: 3000,
        timeout: 55000,
        proxy: "auto",
        location: { country: "CA", languages: ["en-CA"] },
        jsonOptions: { prompt: EXTRACT_PROMPT, schema: LISTING_SCHEMA },
      }),
      signal: AbortSignal.timeout(65000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      logger.warn(
        { status: res.status, url, body: text.slice(0, 300) },
        "Firecrawl scrape returned non-200"
      );
      return [];
    }

    const data = (await res.json()) as {
      success?: boolean;
      data?: { json?: { listings?: ExtractedListing[] } };
    };
    const listings = data?.data?.json?.listings ?? [];
    logger.info({ url, count: listings.length }, "Firecrawl scrape complete");

    scrapeCache.set(url, { listings, expires: Date.now() + SCRAPE_TTL_MS });
    return listings;
  } catch (err) {
    logger.error({ err, url }, "Firecrawl scrape failed");
    return [];
  }
}

function citySlug(location: string): string {
  return location
    .split(",")[0]
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-");
}

// Major Canadian cities -> province code for Realtor.ca path construction
const CITY_PROVINCE: Record<string, string> = {
  toronto: "on",
  scarborough: "on",
  etobicoke: "on",
  "north-york": "on",
  mississauga: "on",
  brampton: "on",
  markham: "on",
  "richmond-hill": "on",
  vaughan: "on",
  oakville: "on",
  burlington: "on",
  hamilton: "on",
  ottawa: "on",
  london: "on",
  kitchener: "on",
  waterloo: "on",
  windsor: "on",
  kingston: "on",
  barrie: "on",
  guelph: "on",
  vancouver: "bc",
  burnaby: "bc",
  surrey: "bc",
  richmond: "bc",
  victoria: "bc",
  kelowna: "bc",
  calgary: "ab",
  edmonton: "ab",
  "red-deer": "ab",
  montreal: "qc",
  laval: "qc",
  quebec: "qc",
  gatineau: "qc",
  winnipeg: "mb",
  regina: "sk",
  saskatoon: "sk",
  halifax: "ns",
};

const TYPE_TO_ZOLO: Record<string, string> = {
  house: "houses",
  condo: "condos",
  townhouse: "townhouses",
};

function buildCandidateUrls(filters: ParsedFilters): string[] {
  const location = filters.location?.trim() || "Toronto";
  const slug = citySlug(location);
  const province = CITY_PROVINCE[slug] ?? "on";
  const urls: string[] = [];

  // Realtor.ca (user's preferred source)
  urls.push(`https://www.realtor.ca/${province}/${slug}/real-estate`);

  // Zolo.ca fallback — clean URLs, aggregates Canadian MLS listings
  const zoloType = filters.propertyType ? TYPE_TO_ZOLO[filters.propertyType] : undefined;
  urls.push(
    zoloType
      ? `https://www.zolo.ca/${slug}-real-estate/${zoloType}`
      : `https://www.zolo.ca/${slug}-real-estate`
  );

  return urls;
}

function normalizeType(raw?: string): string {
  const t = (raw ?? "").toLowerCase();
  if (t.includes("condo") || t.includes("apartment")) return "condo";
  if (t.includes("town")) return "townhouse";
  if (t.includes("land") || t.includes("lot") || t.includes("vacant")) return "land";
  return "house";
}

function hashId(input: string): string {
  let h = 0;
  for (let i = 0; i < input.length; i++) {
    h = (Math.imul(31, h) + input.charCodeAt(i)) | 0;
  }
  return Math.abs(h).toString(36);
}

// Only listings whose detail URL points to a known Canadian MLS source are
// trusted. Firecrawl's JSON extraction is LLM-assisted, so a verifiable
// on-source listing URL is our guard against hallucinated/unreal rows.
const ALLOWED_LISTING_HOSTS = ["realtor.ca", "zolo.ca"];

function resolveListingUrl(raw: string | undefined, origin: string): string | null {
  const value = (raw ?? "").trim();
  if (!value) return null;
  let absolute: string;
  if (value.startsWith("/")) absolute = origin + value;
  else if (value.startsWith("http://") || value.startsWith("https://")) absolute = value;
  else return null;

  let host: string;
  try {
    host = new URL(absolute).hostname.toLowerCase();
  } catch {
    return null;
  }
  const ok = ALLOWED_LISTING_HOSTS.some(
    (h) => host === h || host === `www.${h}` || host.endsWith(`.${h}`)
  );
  return ok ? absolute : null;
}

function mapListing(l: ExtractedListing, sourceUrl: string): PropertyResult | null {
  const price = typeof l.price === "number" && l.price > 0 ? Math.round(l.price) : 0;
  const address = (l.address ?? "").trim();
  if (!price || !address) return null;

  const isRealtor = sourceUrl.includes("realtor.ca");
  const source = isRealtor ? "Realtor.ca" : "Zolo.ca";
  const origin = isRealtor ? "https://www.realtor.ca" : "https://www.zolo.ca";

  // Reject any row we can't trace back to a real listing on an allowed source.
  const listingUrl = resolveListingUrl(l.listingUrl, origin);
  if (!listingUrl) return null;

  let photo = l.imageUrl ?? null;
  if (photo && photo.startsWith("//")) photo = "https:" + photo;

  const sqft = typeof l.sqft === "number" && l.sqft > 0 ? Math.round(l.sqft) : null;
  const id = `ca-${hashId(`${address}|${l.city ?? ""}|${price}`)}`;

  return {
    id,
    address,
    city: (l.city ?? "").trim(),
    state: (l.province ?? "").trim(),
    zipCode: (l.postalCode ?? "").trim(),
    price,
    bedrooms: typeof l.bedrooms === "number" ? l.bedrooms : null,
    bathrooms: typeof l.bathrooms === "number" ? l.bathrooms : null,
    sqft,
    propertyType: normalizeType(l.propertyType),
    yearBuilt: null,
    description: null,
    photos: photo ? [photo] : [],
    lat: null,
    lng: null,
    mlsId: null,
    listingUrl,
    daysOnMarket: null,
    pricePerSqft: sqft && price ? Math.round(price / sqft) : null,
    source,
    matchScore: null,
  };
}

function applyHardFilters(props: PropertyResult[], filters: ParsedFilters): PropertyResult[] {
  return props.filter((p) => {
    if (filters.minPrice && p.price < filters.minPrice) return false;
    if (filters.maxPrice && p.price > filters.maxPrice) return false;
    if (filters.minBedrooms && p.bedrooms != null && p.bedrooms < filters.minBedrooms) return false;
    if (filters.minBathrooms && p.bathrooms != null && p.bathrooms < filters.minBathrooms) return false;
    return true;
  });
}

/**
 * Fetch REAL Canadian listings via Firecrawl. Tries Realtor.ca first, then
 * Zolo.ca. Returns [] if nothing real could be retrieved (no fake fallback).
 */
export async function searchCanadianListings(
  filters: ParsedFilters,
  maxResults = 24
): Promise<PropertyResult[]> {
  const urls = buildCandidateUrls(filters);

  for (const url of urls) {
    const raw = await firecrawlScrape(url);
    if (raw.length === 0) continue;

    const mapped = raw
      .map((l) => mapListing(l, url))
      .filter((p): p is PropertyResult => p !== null);

    const deduped = Array.from(new Map(mapped.map((p) => [p.id, p])).values());
    // Honest filtering: never return listings that violate the user's hard
    // constraints (price/beds/baths). If filters eliminate everything, keep
    // trying the next source and ultimately return [] so the UI can honestly
    // say "no matches — try broadening your criteria".
    const finalList = applyHardFilters(deduped, filters).slice(0, maxResults);

    if (finalList.length > 0) {
      rememberProperties(finalList);
      logger.info({ url, returned: finalList.length }, "Live listings retrieved");
      return finalList;
    }
  }

  return [];
}

// ---- featured listings (home page) cached for longer to save credits ----
let featuredCache: { props: PropertyResult[]; expires: number } | null = null;
const FEATURED_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

export async function getFeaturedCanadianListings(count = 6): Promise<PropertyResult[]> {
  if (featuredCache && featuredCache.expires > Date.now()) {
    return featuredCache.props.slice(0, count);
  }
  const props = await searchCanadianListings({
    location: "Toronto",
    minPrice: null,
    maxPrice: null,
    minBedrooms: null,
    minBathrooms: null,
    propertyType: null,
    minSqft: null,
    maxSqft: null,
    keywords: [],
  }, 12);

  if (props.length > 0) {
    featuredCache = { props, expires: Date.now() + FEATURED_TTL_MS };
  }
  return props.slice(0, count);
}
