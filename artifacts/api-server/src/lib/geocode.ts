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

function buildQuery(p: PropertyResult): string {
  return [p.address, p.city, p.state, p.zipCode, "Canada"]
    .map((s) => (s ?? "").trim())
    .filter(Boolean)
    .join(", ");
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

interface NominatimHit {
  lat: string;
  lon: string;
  place_rank?: number;
  addresstype?: string;
  type?: string;
  category?: string;
}

// Only accept results precise enough to be a real listing pin.
function isAddressLevel(hit: NominatimHit): boolean {
  if (typeof hit.place_rank === "number") return hit.place_rank >= MIN_PLACE_RANK;
  // Fallback when place_rank is absent: trust only fine-grained place types.
  const t = (hit.addresstype || hit.type || "").toLowerCase();
  return ["building", "house", "residential", "road", "street"].includes(t);
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
      await sleep(REQUEST_SPACING_MS);
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

    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
      signal: AbortSignal.timeout(15000),
    });

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
