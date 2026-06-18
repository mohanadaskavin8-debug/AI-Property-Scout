import { openai } from "@workspace/integrations-openai-ai-server";
import { logger } from "./logger";

export interface ParsedFilters {
  location: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  minBathrooms: number | null;
  propertyType: string | null;
  minSqft: number | null;
  maxSqft: number | null;
  keywords: string[];
}

/**
 * Internal, richer parse used by the search pipeline. `location` is a clean,
 * geocodable place string (the server resolves it to a real city via Nominatim
 * — the LLM is never trusted as the geographic authority). `isNear` marks
 * proximity queries ("near X"), which trigger distance ranking.
 */
export interface QueryPlan extends ParsedFilters {
  isNear: boolean;
  nearRadiusKm: number | null;
}

export interface PropertyResult {
  id: string;
  address: string;
  city: string;
  state: string;
  zipCode: string;
  price: number;
  bedrooms: number | null;
  bathrooms: number | null;
  sqft: number | null;
  propertyType: string;
  yearBuilt: number | null;
  description: string | null;
  photos: string[];
  lat: number | null;
  lng: number | null;
  mlsId: string | null;
  listingUrl: string | null;
  daysOnMarket: number | null;
  pricePerSqft: number | null;
  source: string;
  matchScore: number | null;
  geocodeStatus?: "ok" | "pending" | "failed";
}

const SYSTEM_PROMPT = `You are the geographic + intent parser for a Canadian real-estate search engine. Convert the user's natural-language query into STRICT JSON. Getting the LOCATION right is the single most important job — a wrong city is a critical failure.

Output a JSON object with EXACTLY these keys:
- location: string or null. The place to search, rewritten as a CLEAN, GEOCODABLE Canadian place string. Expand every abbreviation and resolve well-known landmarks/institutions, appending their city/area + province when you know them. The downstream system geocodes this string against a real map, so include enough context to pin it.
  Examples:
    "Albert Campbell CI"      -> "Albert Campbell Collegiate Institute, Scarborough, Toronto, Ontario"
    "near U of T"             -> "University of Toronto, Toronto, Ontario"
    "by Square One"           -> "Square One Shopping Centre, Mississauga, Ontario"
    "Yonge and Eglinton"      -> "Yonge Street and Eglinton Avenue, Toronto, Ontario"
    "near Rogers Centre"      -> "Rogers Centre, Toronto, Ontario"
    "M5V"                     -> "M5V, Toronto, Ontario"
    "the Beaches"             -> "The Beaches, Toronto, Ontario"
    "Scarborough"             -> "Scarborough, Toronto, Ontario"
    "downtown Vancouver"      -> "Downtown, Vancouver, British Columbia"
  Abbreviations: "CI" = Collegiate Institute; "SS" = Secondary School; "HS" = High School; "PS" = Public School; "U of X"/"UofX" = University of X; "Gen"/"Genl Hospital" = General Hospital; "Stn" = Station; "Ctr"/"Ctre" = Centre.
  Recognize: schools, universities/colleges, hospitals, malls/shopping centres, parks, subway/GO/LRT stations, street intersections, neighbourhoods, FSA postal codes (first 3 characters of a Canadian postal code), and famous landmarks.
  If the user names a place you cannot tie to a Canadian city, return your best CLEAN version of the literal place text — do NOT substitute a different or guessed city. If there is genuinely no location at all, return null.
- isNear: boolean. true when the user wants listings NEAR a point/landmark (near, close to, walking distance, walkable, around, nearby, next to, steps from, minutes from, within X). false for a plain city/neighbourhood search.
- nearRadiusKm: number or null. If an explicit distance is given ("within 5 km", "2 miles"), convert to kilometres; otherwise null.
- minPrice: number or null (CAD). "over/above/at least/from X" -> minPrice.
- maxPrice: number or null (CAD). "under/below/less than/up to/max X" -> maxPrice. "between X and Y" sets both. Expand money shorthand: "1.5m"/"1.5 million" = 1500000, "800k" = 800000, "$1,200,000" = 1200000.
- minBedrooms: integer or null ("4 bed", "4br", "4+1" -> 4).
- minBathrooms: number or null.
- propertyType: one of "house", "condo", "townhouse", "apartment", "land", or null.
- minSqft: integer or null.
- maxSqft: integer or null.
- keywords: array of salient descriptive features (e.g. ["pool", "garage", "renovated", "waterfront", "basement apartment", "finished basement"]).

Return ONLY the JSON object, no markdown fences, no commentary.`;

export async function parsePromptToFilters(prompt: string): Promise<QueryPlan> {
  let raw: Partial<QueryPlan> = {};
  try {
    const response = await openai.chat.completions.create({
      model: "gpt-5.4",
      max_completion_tokens: 1024,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
    });
    const content = response.choices[0]?.message?.content ?? "{}";
    const cleaned = content.replace(/```json\n?|\n?```/g, "").trim();
    raw = JSON.parse(cleaned) as Partial<QueryPlan>;
  } catch {
    logger.warn({ prompt }, "Failed to parse filters from AI response");
  }

  const num = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  const plan: QueryPlan = {
    location: typeof raw.location === "string" && raw.location.trim() ? raw.location.trim() : null,
    minPrice: num(raw.minPrice),
    maxPrice: num(raw.maxPrice),
    minBedrooms: num(raw.minBedrooms),
    minBathrooms: num(raw.minBathrooms),
    propertyType: typeof raw.propertyType === "string" ? raw.propertyType : null,
    minSqft: num(raw.minSqft),
    maxSqft: num(raw.maxSqft),
    keywords: Array.isArray(raw.keywords)
      ? raw.keywords.filter((k): k is string => typeof k === "string")
      : [],
    isNear: raw.isNear === true,
    nearRadiusKm: num(raw.nearRadiusKm),
  };

  // Deterministic safety net: backfill budget + proximity straight from the
  // prompt so a quiet LLM miss can't drop a clearly-stated constraint.
  applyDeterministicBudget(prompt, plan);
  if (!plan.isNear && NEAR_RE.test(prompt)) plan.isNear = true;
  if (plan.nearRadiusKm == null) plan.nearRadiusKm = parseRadiusKm(prompt);

  return plan;
}

const NEAR_RE =
  /\b(near(?:by)?|close to|close by|walking distance|walkable|around|next to|steps (?:to|from)|minutes? (?:to|from)|within)\b/i;

// A monetary token: optional $, digits with separators, optional m/k/million.
const MONEY = String.raw`\$?\d[\d.,]*\s?(?:million|thousand|m|k)?`;

function parseMoney(rawToken: string): number | null {
  const s = rawToken.trim().toLowerCase().replace(/[$,\s]/g, "");
  const m = s.match(/^(\d+(?:\.\d+)?)(million|thousand|m|k)?$/);
  if (!m) return null;
  let n = parseFloat(m[1]);
  const unit = m[2];
  if (unit === "m" || unit === "million") n *= 1_000_000;
  else if (unit === "k" || unit === "thousand") n *= 1_000;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function applyDeterministicBudget(prompt: string, plan: QueryPlan): void {
  const between = prompt.match(
    new RegExp(String.raw`between\s+(${MONEY})\s+(?:and|to|-)\s+(${MONEY})`, "i"),
  );
  if (between) {
    const lo = parseMoney(between[1]);
    const hi = parseMoney(between[2]);
    if (lo != null && plan.minPrice == null) plan.minPrice = Math.min(lo, hi ?? lo);
    if (hi != null && plan.maxPrice == null) plan.maxPrice = Math.max(lo ?? hi, hi);
    return;
  }

  if (plan.maxPrice == null) {
    const max = prompt.match(
      new RegExp(
        String.raw`(?:under|below|less than|up to|at most|no more than|max(?:imum)?|<=?)\s+(${MONEY})`,
        "i",
      ),
    );
    const v = max ? parseMoney(max[1]) : null;
    if (v != null) plan.maxPrice = v;
  }

  if (plan.minPrice == null) {
    const min = prompt.match(
      new RegExp(
        String.raw`(?:over|above|more than|at least|starting (?:at|from)|from|min(?:imum)?|>=?)\s+(${MONEY})`,
        "i",
      ),
    );
    const v = min ? parseMoney(min[1]) : null;
    if (v != null) plan.minPrice = v;
  }
}

function parseRadiusKm(prompt: string): number | null {
  const m = prompt.match(/within\s+(\d+(?:\.\d+)?)\s*(km|kilomet\w*|mi|miles?)/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  if (!Number.isFinite(n) || n <= 0) return null;
  return /mi/i.test(m[2]) ? Math.round(n * 1.609 * 10) / 10 : n;
}

export async function generateSearchSummary(
  prompt: string,
  filters: ParsedFilters,
  count: number
): Promise<string> {
  const response = await openai.chat.completions.create({
    model: "gpt-5.4",
    max_completion_tokens: 256,
    messages: [
      {
        role: "system",
        content:
          "Write a brief, elegant 1-2 sentence summary of what the AI found based on the search. Be specific about the criteria matched. Professional tone.",
      },
      {
        role: "user",
        content: `Search prompt: "${prompt}"\nFilters applied: ${JSON.stringify(filters)}\nResults found: ${count}`,
      },
    ],
  });
  return response.choices[0]?.message?.content ?? `Found ${count} properties matching your search.`;
}

export function scoreProperties(
  properties: PropertyResult[],
  filters: ParsedFilters
): PropertyResult[] {
  return properties
    .map((p) => {
      let score = 50;
      if (filters.minBedrooms && p.bedrooms) {
        score += p.bedrooms >= filters.minBedrooms ? 15 : -20;
      }
      if (filters.maxPrice && p.price <= filters.maxPrice) score += 10;
      if (filters.minPrice && p.price >= filters.minPrice) score += 5;
      if (filters.propertyType && p.propertyType === filters.propertyType) score += 10;
      if (filters.keywords?.length) {
        const desc = (p.description ?? "").toLowerCase();
        const matched = filters.keywords.filter((k) => desc.includes(k.toLowerCase())).length;
        score += matched * 5;
      }
      return { ...p, matchScore: Math.min(100, Math.max(0, score)) };
    })
    .sort((a, b) => (b.matchScore ?? 0) - (a.matchScore ?? 0));
}
