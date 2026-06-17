---
name: Firecrawl real-estate search
description: How Nestly fetches REAL Canadian property listings, and why the managed Firecrawl callback can't be used.
---

# Real listings via Firecrawl (Nestly)

Real estate sites (Zillow, Realtor.ca) return HTTP 403 to direct server fetches (node-fetch + headers do NOT defeat their anti-bot). The only reliable way to get live listings from the backend is a scraping service with a real API key.

## The managed `externalApi__firecrawl` callback is unusable for this
**Why:** In the `code_execution` sandbox, `externalApi__firecrawl` double-encodes JSON bodies — POST `/scrape` and `/search` arrive with `url`/`query` malformed (e.g. URL wrapped in extra quotes → "invalid TLD"; `query` undefined). Tried `body` as object (rejected: must be string), `body` as JSON string, and `query` dict — all fail. Also the callback only exists in the sandbox, never in the Node backend.
**How to apply:** Don't try to power a backend feature with `externalApi__*`. Instead request a real API key as a secret and call the provider's real API from the server.

## What actually works
Backend calls `https://api.firecrawl.dev/v1/scrape` directly with `Authorization: Bearer ${FIRECRAWL_API_KEY}` (secret). Key settings that make Realtor.ca work:
- `formats: ["json"]` + `jsonOptions: { prompt, schema }` — LLM structured extraction of a `listings[]` array (address, city, province, price, beds, baths, sqft, type, imageUrl, listingUrl).
- `proxy: "auto"` — retries with stealth proxy to beat anti-bot.
- `location: { country: "CA" }` — Canadian IP; required for Realtor.ca/Zolo.ca.
- `waitFor: 3000`, `timeout: 55000` (page is JS-rendered).

**Coverage:** Realtor.ca path is `https://www.realtor.ca/{provinceCode}/{city-slug}/real-estate` (needs a city→province map; default `on`). Zolo.ca (`https://www.zolo.ca/{city-slug}-real-estate[/houses|condos|townhouses]`) is the reliable fallback with clean URLs.

## Gotchas
- A cold scrape takes ~20-60s. Cache aggressively: scrape results cached 30 min by URL; home "featured" cached 6h. Conserves the free 500 credits and speeds repeat searches.
- Property detail lookups use an in-memory store populated by search/featured; lost on server restart (acceptable for now, would need DB persistence for prod).
- **No fake-data fallback** — this was an explicit user requirement ("real houses only"). When Firecrawl returns nothing, return an empty result set with an explanatory summary, never sample/generated listings.
- **Trust guard against LLM hallucination:** Firecrawl JSON extraction is LLM-assisted, so a row could be invented. Only accept a listing if it has a detail URL on an allowlisted host (`realtor.ca`/`zolo.ca`); reject rows with missing/off-source URLs. This is the line of defense that keeps "real listings only" honest.
- **Honest hard filtering:** never fall back to unfiltered results when price/beds/baths filters eliminate everything — return `[]` so the UI can say "no matches, broaden criteria". Returning out-of-constraint listings is a form of lying to the user.
- **Side effects must not sink real results:** the AI search summary and the "trending" DB write happen AFTER listings are fetched — wrap both in try/catch so an OpenAI/DB hiccup can't turn a successful live search into a 500.
