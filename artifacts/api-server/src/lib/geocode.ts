import { db, geocodeCacheTable } from "@workspace/db";
import { inArray, sql } from "drizzle-orm";
import { logger } from "./logger";
import type { PropertyResult } from "./propertySearch";

/**
 * Honest geocoding for real listings.
 *
 * Hard rules:
 *  - We NEVER invent a pin. A listing only gets coordinates when Nominatim
 *    returns a STREET-LEVEL (or finer) match for its real address. City- or
 *    neighbourhood-level results are rejected — they would be fake pins.
 *  - Search must never block on uncached geocodes. We apply cache hits
 *    synchronously and enqueue misses to a throttled background queue (≈1 req/s
 *    to comply with the Nominatim usage policy). The map polls for pending IDs.
 *  - Results (and failures) are cached in Postgres so we never re-hit Nominatim
 *    for an address we've already resolved, even across restarts.
 */

export type GeoStatus = "ok" | "pending" | "failed";
interface GeoState {
  lat: number | null;
  lng: number | null;
  status: Exclude<GeoStatus, "pending">;
}

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const USER_AGENT =
  "Nestly/1.0 (Canadian real-estate search; +https://nestly.replit.app)";
const REQUEST_SPACING_MS = 1100; // ~1 req/sec per Nominatim policy
const FAIL_RETRY_MS = 14 * 24 * 60 * 60 * 1000; // re-try failed addresses after 14d
const MIN_PLACE_RANK = 26; // 26 = street, 30 = house; < 26 is city/suburb => reject

// ---- province name <-> 2-letter code (covers all 13 provinces/territories) ----
const PROVINCE_CODE: Record<string, string> = {
  ontario: "ON",
  quebec: "QC",
  "québec": "QC",
  "british columbia": "BC",
  alberta: "AB",
  manitoba: "MB",
  saskatchewan: "SK",
  "nova scotia": "NS",
  "new brunswick": "NB",
  "newfoundland and labrador": "NL",
  "prince edward island": "PE",
  "northwest territories": "NT",
  yukon: "YT",
  nunavut: "NU",
};
const CODE_PROVINCE: Record<string, string> = Object.fromEntries(
  Object.entries(PROVINCE_CODE).map(([name, code]) => [
    code,
    name.charAt(0).toUpperCase() + name.slice(1),
  ]),
);

/** A real Canadian place resolved from free text — the geographic source of truth. */
export interface ResolvedPlace {
  lat: number | null;
  lng: number | null;
  city: string; // best municipality, e.g. "Toronto"
  borough: string | null; // suburb/borough, e.g. "Scarborough"
  province: string; // 2-letter code, e.g. "ON"
  provinceName: string; // e.g. "Ontario"
  displayName: string; // concise label for summaries
  precise: boolean; // true only when lat/lng is an exact landmark POINT, not an area centroid
}

// Runtime fast-path caches (mirror of the persistent cache + id resolution).
const geoByKey = new Map<string, GeoState>();
const idToKey = new Map<string, string>();

// Throttled single-worker queue.
const queue: { key: string; query: string }[] = [];
const queued = new Set<string>();
let draining = false;

function normalizeKey(p: PropertyResult): string {
  return [p.address, p.city, p.state, p.zipCode, "CA"]
    .map((s) => (s ?? "").trim().toLowerCase())
    .join("|")
    .replace(/\s+/g, " ");
}

// Canadian MLS addresses often carry a leading unit/suite prefix that Nominatim
// cannot resolve (e.g. "1007 - 120 VARNA DRIVE", "Unit 5 - 12 Main St"). Strip it
// so the underlying street address geocodes — otherwise these listings stay
// coordless and slip past walking-distance filtering as unverified.
function streetAddress(address: string | null | undefined): string {
  let a = (address ?? "").trim();
  // "Unit 5 - 12 Main St", "Apt 3B - ..." → drop the leading unit word + id.
  a = a.replace(/^(?:unit|apt|apartment|suite|ste|no\.?|#)\s+[\w-]+\s*[-–—]\s*(?=\d)/i, "");
  // "1007 - 120 VARNA DR", "33 - 869 WILSON AVE", "B02 - 135 DALHOUSIE ST" → drop
  // a leading unit token (numeric OR alphanumeric, e.g. "B02"/"PH1") that precedes
  // the actual street number.
  a = a.replace(/^[A-Za-z0-9]+\s*[-–—]\s*(?=\d)/, "");
  return a.trim();
}

function buildQuery(p: PropertyResult): string {
  return [streetAddress(p.address), p.city, p.state, p.zipCode, "Canada"]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Global Nominatim rate gate. EVERY Nominatim request — place resolution AND
// listing-address geocoding — funnels through this one spaced chain so we never
// exceed ~1 req/sec even under concurrent searches (Nominatim usage policy).
let nominatimChain: Promise<unknown> = Promise.resolve();
function nominatimFetch(url: URL): Promise<Response> {
  const run = nominatimChain.then(async () => {
    try {
      return await fetch(url, {
        headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
    } finally {
      await sleep(REQUEST_SPACING_MS);
    }
  });
  nominatimChain = run.catch(() => undefined);
  return run as Promise<Response>;
}

interface NominatimHit {
  lat: string;
  lon: string;
  place_rank?: number;
  addresstype?: string;
  type?: string;
  category?: string;
  display_name?: string;
  address?: {
    city?: string;
    town?: string;
    municipality?: string;
    village?: string;
    suburb?: string;
    city_district?: string;
    borough?: string;
    neighbourhood?: string;
    quarter?: string;
    state?: string;
    region?: string;
    postcode?: string;
  };
}

// Only accept results precise enough to be a real listing pin.
function isAddressLevel(hit: NominatimHit): boolean {
  if (typeof hit.place_rank === "number") return hit.place_rank >= MIN_PLACE_RANK;
  // Fallback when place_rank is absent: trust only fine-grained place types.
  const t = (hit.addresstype || hit.type || "").toLowerCase();
  return ["building", "house", "residential", "road", "street"].includes(t);
}

// Area-level Nominatim result types — a centroid, NOT a walkable point.
const AREA_ADDRESS_TYPES = new Set([
  "city", "town", "village", "hamlet", "suburb", "quarter", "neighbourhood",
  "city_district", "borough", "municipality", "county", "region", "state",
  "province", "postcode", "administrative", "political",
]);

/** True when a hit is a specific POINT (POI/building/road), not an area centroid. */
function isPrecisePoint(hit: NominatimHit): boolean {
  const at = (hit.addresstype || hit.type || "").toLowerCase();
  return at !== "" && !AREA_ADDRESS_TYPES.has(at);
}

/**
 * Mutates each property's lat/lng/geocodeStatus in place using the cache, and
 * enqueues anything still unknown. Returns immediately (does not await network).
 */
export async function hydrateGeocode(props: PropertyResult[]): Promise<void> {
  if (props.length === 0) return;

  const keys = props.map(normalizeKey);
  props.forEach((p, i) => idToKey.set(p.id, keys[i]));

  const now = Date.now();
  const unknown = Array.from(new Set(keys.filter((k) => !geoByKey.has(k))));
  if (unknown.length > 0) {
    try {
      const rows = await db
        .select()
        .from(geocodeCacheTable)
        .where(inArray(geocodeCacheTable.addressKey, unknown));
      for (const r of rows) {
        if (r.status === "ok" && r.lat != null && r.lng != null) {
          geoByKey.set(r.addressKey, { lat: r.lat, lng: r.lng, status: "ok" });
        } else if (r.status === "failed") {
          const retryDue = r.nextRetryAt != null && r.nextRetryAt.getTime() <= now;
          // Honour the failure (don't re-hit) until the retry window opens.
          if (!retryDue) geoByKey.set(r.addressKey, { lat: null, lng: null, status: "failed" });
        }
      }
    } catch (err) {
      logger.warn({ err }, "geocode cache read failed; treating as misses");
    }
  }

  props.forEach((p, i) => {
    const state = geoByKey.get(keys[i]);
    if (state?.status === "ok") {
      p.lat = state.lat;
      p.lng = state.lng;
      p.geocodeStatus = "ok";
    } else if (state?.status === "failed") {
      p.lat = null;
      p.lng = null;
      p.geocodeStatus = "failed";
    } else {
      p.lat = null;
      p.lng = null;
      p.geocodeStatus = "pending";
      enqueue(keys[i], buildQuery(p));
    }
  });

  void drain();
}

function enqueue(key: string, query: string): void {
  if (!query || queued.has(key) || geoByKey.has(key)) return;
  queued.add(key);
  queue.push({ key, query });
}

async function drain(): Promise<void> {
  if (draining) return;
  draining = true;
  try {
    while (queue.length > 0) {
      const job = queue.shift();
      if (!job) break;
      queued.delete(job.key);
      if (geoByKey.has(job.key)) continue;
      await geocodeOne(job.key, job.query);
    }
  } finally {
    draining = false;
  }
}

async function geocodeOne(key: string, query: string): Promise<void> {
  let state: GeoState = { lat: null, lng: null, status: "failed" };
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "ca");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const res = await nominatimFetch(url);

    if (res.ok) {
      const data = (await res.json()) as NominatimHit[];
      const hit = data[0];
      if (hit && isAddressLevel(hit)) {
        const lat = parseFloat(hit.lat);
        const lng = parseFloat(hit.lon);
        if (Number.isFinite(lat) && Number.isFinite(lng)) {
          state = { lat, lng, status: "ok" };
        }
      }
    } else {
      logger.warn({ status: res.status, query }, "Nominatim returned non-200");
    }
  } catch (err) {
    logger.warn({ err, query }, "Nominatim geocode failed");
  }

  geoByKey.set(key, state);
  await persist(key, state);
}

async function persist(key: string, state: GeoState): Promise<void> {
  const now = new Date();
  const nextRetryAt = state.status === "failed" ? new Date(now.getTime() + FAIL_RETRY_MS) : null;
  try {
    await db
      .insert(geocodeCacheTable)
      .values({
        addressKey: key,
        lat: state.lat,
        lng: state.lng,
        status: state.status,
        source: "nominatim",
        attempts: 1,
        lastAttemptAt: now,
        nextRetryAt,
        updatedAt: now,
      })
      .onConflictDoUpdate({
        target: geocodeCacheTable.addressKey,
        set: {
          lat: state.lat,
          lng: state.lng,
          status: state.status,
          attempts: sql`${geocodeCacheTable.attempts} + 1`,
          lastAttemptAt: now,
          nextRetryAt,
          updatedAt: now,
        },
      });
  } catch (err) {
    logger.warn({ err, key }, "geocode persist failed");
  }
}

/** Synchronous best-effort lookup used when serving a stored property detail. */
export function getGeocodeForId(id: string): GeoState | undefined {
  const key = idToKey.get(id);
  return key ? geoByKey.get(key) : undefined;
}

/** Polled by the map for listings that were "pending" at search time. */
export async function getGeocodeStatus(
  ids: string[],
): Promise<{ id: string; lat: number | null; lng: number | null; geocodeStatus: GeoStatus }[]> {
  const pairs = ids.map((id) => ({ id, key: idToKey.get(id) }));

  const missing = Array.from(
    new Set(pairs.map((p) => p.key).filter((k): k is string => !!k && !geoByKey.has(k))),
  );
  if (missing.length > 0) {
    try {
      const rows = await db
        .select()
        .from(geocodeCacheTable)
        .where(inArray(geocodeCacheTable.addressKey, missing));
      for (const r of rows) {
        if (r.status === "ok" && r.lat != null && r.lng != null) {
          geoByKey.set(r.addressKey, { lat: r.lat, lng: r.lng, status: "ok" });
        } else if (r.status === "failed") {
          geoByKey.set(r.addressKey, { lat: null, lng: null, status: "failed" });
        }
      }
    } catch (err) {
      logger.warn({ err }, "geocode status read failed");
    }
  }

  return pairs.map(({ id, key }) => {
    const state = key ? geoByKey.get(key) : undefined;
    if (!state) return { id, lat: null, lng: null, geocodeStatus: "pending" as const };
    return { id, lat: state.lat, lng: state.lng, geocodeStatus: state.status };
  });
}

// ---- place resolution (the geographic source of truth for a search) ----

const PLACE_TTL_MS = 24 * 60 * 60 * 1000; // resolved places are stable; cache 24h
const placeCache = new Map<string, { place: ResolvedPlace | null; expires: number }>();
// Serialize Nominatim place lookups so we never burst past the ~1 req/s policy.
let placeGate: Promise<unknown> = Promise.resolve();

function normalizePlaceKey(query: string): string {
  return query.trim().toLowerCase().replace(/\s+/g, " ");
}

function titleCase(s: string): string {
  return s
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Resolve a free-text place (landmark, school, intersection, neighbourhood,
 * postal code, or city) to a REAL Canadian municipality + province + coords via
 * Nominatim. Returns null when it cannot be confidently resolved — callers must
 * NOT guess a city in that case (no fake geography).
 */
export async function resolvePlace(query: string): Promise<ResolvedPlace | null> {
  const clean = (query ?? "").trim();
  if (!clean) return null;

  const key = normalizePlaceKey(clean);
  const cached = placeCache.get(key);
  if (cached && cached.expires > Date.now()) return cached.place;

  // Chain onto the gate so place lookups run one-at-a-time, spaced politely.
  const run = placeGate.then(async () => {
    const again = placeCache.get(key);
    if (again && again.expires > Date.now()) return again.place;
    let place: ResolvedPlace | null = null;
    // Try the full string first, then progressively broaden to the trailing
    // "City, Province" context. Each attempt is a REAL geocode of a real place
    // string — never a guess. This rescues queries Nominatim can't pin exactly
    // (e.g. "Yonge & Eglinton" intersections) by landing on the right city.
    for (const candidate of placeCandidates(clean)) {
      place = await fetchPlace(candidate);
      if (place) break;
    }
    placeCache.set(key, { place, expires: Date.now() + PLACE_TTL_MS });
    return place;
  });
  // Keep the gate alive regardless of this lookup's success.
  placeGate = run.catch(() => undefined);
  return run;
}

/**
 * Build geocode candidates from most-specific to least: the full string, then
 * the same string with leading (most-specific) comma segments dropped, keeping
 * at least a "City, Province"-shaped tail. A province alone is never tried (it
 * has no municipality and would only broaden to a useless centroid).
 */
function placeCandidates(clean: string): string[] {
  const segs = clean
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  const cands = [segs.join(", ")];
  for (let i = 1; i <= segs.length - 2; i++) {
    cands.push(segs.slice(i).join(", "));
  }
  return Array.from(new Set(cands.filter(Boolean)));
}

async function fetchPlace(query: string): Promise<ResolvedPlace | null> {
  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set("q", query);
    url.searchParams.set("format", "jsonv2");
    url.searchParams.set("countrycodes", "ca");
    url.searchParams.set("limit", "1");
    url.searchParams.set("addressdetails", "1");

    const res = await nominatimFetch(url);
    if (!res.ok) {
      logger.warn({ status: res.status, query }, "Nominatim place lookup non-200");
      return null;
    }

    const data = (await res.json()) as NominatimHit[];
    const hit = data[0];
    if (!hit) return null;

    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    const a = hit.address ?? {};

    const stateName = (a.state ?? a.region ?? "").trim();
    const province = PROVINCE_CODE[stateName.toLowerCase()] ?? null;
    if (!province) return null; // outside the 13 provinces/territories => unusable

    const municipality = (a.city ?? a.town ?? a.municipality ?? a.village ?? "").trim();
    const sub = (a.city_district ?? a.borough ?? a.suburb ?? "").trim();

    const city = municipality || sub;
    if (!city) return null; // no municipality => cannot build a source URL

    const borough = sub && sub.toLowerCase() !== city.toLowerCase() ? sub : null;

    const displayName = [borough, city, province].filter(Boolean).join(", ");
    const precise = isPrecisePoint(hit) && Number.isFinite(lat) && Number.isFinite(lng);

    return {
      lat: Number.isFinite(lat) ? lat : null,
      lng: Number.isFinite(lng) ? lng : null,
      city,
      borough,
      province,
      provinceName: CODE_PROVINCE[province] ?? titleCase(stateName),
      displayName,
      precise,
    };
  } catch (err) {
    logger.warn({ err, query }, "Nominatim place lookup failed");
    return null;
  }
}

/** Best-effort place from the curated city map — used only if Nominatim is down. */
export function placeFromProvinceCode(
  city: string,
  province: string,
): ResolvedPlace {
  const code = province.toUpperCase();
  return {
    lat: null,
    lng: null,
    city: titleCase(city),
    borough: null,
    province: code,
    provinceName: CODE_PROVINCE[code] ?? "",
    displayName: `${titleCase(city)}, ${code}`,
    precise: false,
  };
}

/** Great-circle distance in kilometres between two lat/lng points. */
export function haversineKm(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);
  return 2 * R * Math.asin(Math.sqrt(h));
}

function refreshFromCache(props: PropertyResult[]): void {
  for (const p of props) {
    const key = idToKey.get(p.id);
    const st = key ? geoByKey.get(key) : undefined;
    if (st?.status === "ok") {
      p.lat = st.lat;
      p.lng = st.lng;
      p.geocodeStatus = "ok";
    } else if (st?.status === "failed") {
      p.lat = null;
      p.lng = null;
      p.geocodeStatus = "failed";
    }
  }
}

/**
 * For "near X" searches: resolve as many listing coordinates as possible within
 * a strict time budget. Uses the cache first, then lets the single throttled
 * worker (≈1 req/s, policy-compliant) make progress while we poll — we never
 * fire concurrent Nominatim requests. Mutates props' lat/lng/geocodeStatus.
 */
export async function awaitGeocodeWithin(
  props: PropertyResult[],
  budgetMs = 9000,
): Promise<void> {
  if (props.length === 0) return;
  await hydrateGeocode(props); // applies cache hits, enqueues misses, starts drain
  const start = Date.now();
  while (Date.now() - start < budgetMs) {
    refreshFromCache(props);
    if (!props.some((p) => p.geocodeStatus === "pending")) break;
    await sleep(300);
  }
  refreshFromCache(props);
}
