# Nestly — AI Home Search

Nestly is a luxury, AI-powered real estate search experience for the Canadian market. Users describe their ideal home in natural language and Nestly returns **real, live listings** scraped from Realtor.ca (with Zolo.ca as fallback) — no generated or sample data, ever.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server
- `pnpm --filter @workspace/home-search run dev` — run the web frontend
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-server run typecheck` — typecheck just the API
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL` — Postgres connection string
- Required secret: `FIRECRAWL_API_KEY` — powers live listing retrieval (real data)
- AI uses Replit AI Integrations (OpenAI proxy) — no separate OpenAI key needed

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite (`artifacts/home-search`)
- API: Express 5 (`artifacts/api-server`)
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Live data: Firecrawl (`api.firecrawl.dev`) scraping Realtor.ca / Zolo.ca
- AI: OpenAI via Replit AI Integrations (prompt parsing, search summaries)
- Maps: Leaflet + react-leaflet v5 (CARTO dark tiles), `supercluster` clustering; OpenStreetMap Nominatim geocoding with a persisted `geocode_cache` table

## Where things live

- `artifacts/api-server/src/lib/firecrawlSearch.ts` — **real data engine.** Scrapes Realtor.ca then Zolo.ca via Firecrawl, with caching + in-memory property store. Exports `searchCanadianListings`, `getFeaturedCanadianListings`, `getStoredProperty`, `hasFirecrawl`.
- `artifacts/api-server/src/lib/propertySearch.ts` — AI helpers only: `parsePromptToFilters`, `generateSearchSummary`, `scoreProperties` (+ `ParsedFilters`/`PropertyResult` types).
- `artifacts/api-server/src/lib/geocode.ts` — Nominatim geocoding engine; resolves listing addresses to lat/lng, persists terminal `ok`/`failed` to `geocode_cache`, queues misses without blocking listing retrieval. Never guesses a pin.
- `artifacts/api-server/src/routes/properties/index.ts` — search / featured / detail routes plus `POST /properties/geocode-status` (polled for `pending` listings), all wired to real data. Detail (`GET /properties/:id`) does a per-listing Firecrawl scrape (cached) and merges only observed fields — missing fields stay null (honest "Not available"). `pricePerSqft` is **derived** (`price/sqft`), never source-extracted — see `.agents/memory/nestly-data-honesty.md`.
- `artifacts/api-server/src/routes/{saved-searches,visited-properties,notifications}/index.ts` — P2 auth-scoped routes mirroring favorites (`requireAuth` → `req.userId`, ownership via `and(eq(id),eq(userId))`). Visited/favorites persist the client `propertyData` snapshot by design (survives the in-memory store's restarts).
- `artifacts/api-server/src/routes/openai/index.ts` — conversational AI endpoints.
- `artifacts/home-search/src/pages/Search.tsx` — map-first Search shell: `?view=map|list` toggle, live counters, drawer, honest pending/failed badges.
- `artifacts/home-search/src/components/PropertyMap.tsx` — Leaflet/CARTO dark map, supercluster clusters, gold price-pill + cyan cluster `divIcon` markers (only `geocodeStatus==='ok'` listings get pins).
- `artifacts/home-search/src/hooks/useGeocodePolling.ts` — polls geocode-status ~2.5s with a hard cap; merges only server-confirmed coords.
- `artifacts/home-search/src/lib/format.ts` — shared CAD `formatPrice` / `priceLabel`.
- `artifacts/home-search/src/pages/PropertyDetails.tsx` — photo carousel + thumbnail gallery + lightbox (Esc/arrows), honest `StatRow` fields ("Not available" for null), favorite/share, records a visit once after authed load, and an honest "View on {source}" link (no fake "Contact Agent").
- `artifacts/home-search/src/components/NotificationBell.tsx` — header bell + unread badge (60s refetch), dropdown with mark-one/mark-all (refetches list **and** unread-count), honest empty state; hidden when signed out.
- `artifacts/home-search/src/components/SavedSearches.tsx` — save/list/run/delete the current query (chips); signed-in only; shown on Search in both map+list views.
- `artifacts/home-search/src/pages/Visited.tsx` — "Recently Viewed" page (mirrors Favorites, `visitCount` badge, signed-out prompt).
- `artifacts/home-search/src/App.tsx` — frontend routes (supports `?skip` to bypass the 3D intro).
- `lib/api-spec/openapi.yaml` — API contract (source of truth for generated hooks/schemas).

## Auth

- **Replit-managed Clerk** (white-label, cookie auth on web — no Bearer tokens). Browsing is fully public; sign-in is required only for per-user features: favorites, saved searches, visited history, and notifications (and, in later phases, message/sell/use FindIT).
- Server derives identity via `getAuth(req).userId` in `requireAuth` (`artifacts/api-server/src/middlewares/auth.ts`) — never from the request body/query. A `users` table is provisioned just-in-time from the Clerk profile.
- Favorites are per-user with server-side ownership checks. CORS uses a same-origin allowlist (built from `REPLIT_DOMAINS`/`REPLIT_DEV_DOMAIN`), never reflect-all, because auth is cookie-based.
- See `.agents/memory/nestly-auth-decisions.md` for the non-obvious tradeoffs (favorites snapshot vs. hydrate-by-id, JIT provisioning, CORS).

## Architecture decisions

- **No fake data, ever.** When live scraping returns nothing, the API returns an empty result set with an honest summary — never sample/generated listings. This is a hard product requirement.
- **Backend calls Firecrawl's real API directly** with `FIRECRAWL_API_KEY`. The managed `externalApi__firecrawl` sandbox callback is NOT used (it double-encodes JSON bodies and isn't available in the Node backend). See `.agents/memory/firecrawl-realtor-search.md`.
- **Aggressive caching** to conserve Firecrawl credits and cut latency: scrape results cached ~30 min by URL; home "featured" cached ~6h.
- **Property detail** is served from an in-memory store populated by search/featured calls (lost on restart; would need DB persistence for production).

## Product

- Natural-language home search ("4-bed house in Scarborough under $1M") → AI extracts filters → real Realtor.ca listings, scored and summarized.
- Court-finder-style map-first Search: full-bleed dark map with real listings as pins, map↔list toggle, animated live counters, glass panels, bottom AI search bar, and an animated property drawer. Listings that can't be geocoded show "Location pending" / "Map pin unavailable" badges — never a fake pin.
- Home page with cinematic 3D intro and curated "Featured Residences" (real live listings).
- Property detail pages with a photo carousel + lightbox, real source fields (year built, MLS#, days on market, calculated price/sqft), honest "Not available" for anything the source didn't provide, favorite/share, and a "View on {source}" link to the live listing.
- Per-user (signed-in): favorites, saved searches (save/re-run a query), recently-viewed history, and an in-app notification bell shell.
- Favorites and Market pages.
- Deep-black + warm-gold luxury theme with a cyan/electric accent (`--accent2`), premium motion.

## User preferences

- **Show only REAL listings. Never generated, fake, or sample houses.** (Repeatedly emphasized.)
- Market is **Canada** (Realtor.ca primary source).
- Design bar: Apple/Shopify-grade; aim to beat jitty.com.

## Gotchas

- A cold search hits Firecrawl and can take ~20-60s; repeat searches are fast (cached). Don't mistake the loading state for a hang.
- Realtor.ca/Zolo.ca require `location: { country: "CA" }` and `proxy: "auto"` in the Firecrawl call, plus a city→province map for Realtor.ca URLs.
- Direct server `fetch` of Zillow/Realtor.ca returns 403 — must go through Firecrawl.
- Geocoding genuinely fails for unit-prefixed addresses (e.g. "1007 - 120 VARNA DRIVE") Nominatim can't resolve to street level — that's expected and shown honestly, never a guessed pin. See `.agents/memory/nestly-map-geocoding.md`.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.agents/memory/firecrawl-realtor-search.md` for the live-data implementation details and pitfalls
