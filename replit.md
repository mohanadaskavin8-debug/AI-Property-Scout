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

## Where things live

- `artifacts/api-server/src/lib/firecrawlSearch.ts` — **real data engine.** Scrapes Realtor.ca then Zolo.ca via Firecrawl, with caching + in-memory property store. Exports `searchCanadianListings`, `getFeaturedCanadianListings`, `getStoredProperty`, `hasFirecrawl`.
- `artifacts/api-server/src/lib/propertySearch.ts` — AI helpers only: `parsePromptToFilters`, `generateSearchSummary`, `scoreProperties` (+ `ParsedFilters`/`PropertyResult` types).
- `artifacts/api-server/src/routes/properties/index.ts` — search / featured / detail routes, all wired to real data.
- `artifacts/api-server/src/routes/openai/index.ts` — conversational AI endpoints.
- `artifacts/home-search/src/App.tsx` — frontend routes (supports `?skip` to bypass the 3D intro).
- `lib/api-spec/openapi.yaml` — API contract (source of truth for generated hooks/schemas).

## Architecture decisions

- **No fake data, ever.** When live scraping returns nothing, the API returns an empty result set with an honest summary — never sample/generated listings. This is a hard product requirement.
- **Backend calls Firecrawl's real API directly** with `FIRECRAWL_API_KEY`. The managed `externalApi__firecrawl` sandbox callback is NOT used (it double-encodes JSON bodies and isn't available in the Node backend). See `.agents/memory/firecrawl-realtor-search.md`.
- **Aggressive caching** to conserve Firecrawl credits and cut latency: scrape results cached ~30 min by URL; home "featured" cached ~6h.
- **Property detail** is served from an in-memory store populated by search/featured calls (lost on restart; would need DB persistence for production).

## Product

- Natural-language home search ("4-bed house in Scarborough under $1M") → AI extracts filters → real Realtor.ca listings, scored and summarized.
- Home page with cinematic 3D intro and curated "Featured Residences" (real live listings).
- Property detail pages with photos, price-per-sqft, days on market, and a link to the source listing.
- Favorites and Market pages.
- Deep-black + warm-gold luxury theme, premium motion.

## User preferences

- **Show only REAL listings. Never generated, fake, or sample houses.** (Repeatedly emphasized.)
- Market is **Canada** (Realtor.ca primary source).
- Design bar: Apple/Shopify-grade; aim to beat jitty.com.

## Gotchas

- A cold search hits Firecrawl and can take ~20-60s; repeat searches are fast (cached). Don't mistake the loading state for a hang.
- Realtor.ca/Zolo.ca require `location: { country: "CA" }` and `proxy: "auto"` in the Firecrawl call, plus a city→province map for Realtor.ca URLs.
- Direct server `fetch` of Zillow/Realtor.ca returns 403 — must go through Firecrawl.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
- See `.agents/memory/firecrawl-realtor-search.md` for the live-data implementation details and pitfalls
