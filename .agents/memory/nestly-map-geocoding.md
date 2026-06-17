---
name: Nestly map + geocoding (court-finder view)
description: Non-obvious decisions behind the dark map view, marker clustering, geocode polling, and how the "real listings only / no fake pins" rule is enforced on the frontend.
---

# Map view & geocoding decisions

The Search page renders a map MODE (a `?view=map|list` toggle on `/search`), not a separate route. Map mode is the default ("the wow").

## Clustering library: supercluster, NOT react-leaflet-cluster
We use `supercluster` directly (compute clusters from map bounds+zoom, render our own `L.divIcon` markers) rather than `react-leaflet-cluster` / `leaflet.markercluster`.
**Why:** the app is on React 19 + react-leaflet v5. `react-leaflet-cluster` lags those peer versions and risks an "Invalid hook call / more than one copy of React" failure. supercluster is framework-agnostic (no React peer dep), so it sidesteps the whole problem and gives full control over the cyan cluster bubbles + gold price pills.
**How to apply:** if adding more map features, keep the marker rendering in our own divIcon code; don't reach for a React wrapper plugin that pins an older React/react-leaflet.

## Custom divIcon markers avoid the Leaflet broken-icon trap
All markers are `L.divIcon` (HTML price pills / cluster bubbles). We never use Leaflet's default image markers.
**Why:** Leaflet's default marker PNGs 404 under Vite bundling and normally need an `L.Icon.Default` patch. Using divIcons entirely means we never import or patch the default icon assets.

## Tiles: CARTO dark_all, keyless but attribution is mandatory
`https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png` needs no API key, but the OpenStreetMap + CARTO attribution control must stay visible (their ToS). Don't hide `attributionControl`.

## Geocode polling MUST cap its attempts
The frontend polls `POST /properties/geocode-status` for any `pending` listing and merges resolved coords. There is a hard `MAX_POLLS` cap (~50 × 2.5s).
**Why:** the server's runtime `id→cacheKey` map lives in memory. If the API restarts mid-session, previously-enqueued ids can report `pending` forever — uncapped polling would loop indefinitely. After the cap we leave them as "location pending" (honest), never a guess.
**How to apply:** any future polling against the in-memory property/geocode store needs a similar cap + honest terminal state.

## "No fake pins" is enforced at the UI layer too (hard product rule)
A listing only gets a map pin when `geocodeStatus === 'ok'` AND it has real lat/lng. `pending` → "Location pending" badge; `failed` → "Map pin unavailable" badge; both still appear in the LIST with the listing, just not on the map. The map's only synthetic coordinate is the default viewport center (Toronto) used purely to frame an empty map — it is never rendered as a marker.
**Why:** mirrors the backend's "real data only, ever" rule. Geocoding genuinely fails for unit-prefixed addresses (e.g. "1007 - 120 VARNA DRIVE") that Nominatim can't resolve to street level — that's expected; show it honestly rather than dropping a wrong pin.

## Currency is CAD
Canadian market → `Intl.NumberFormat('en-CA', { currency: 'CAD' })` via the shared `formatPrice` in `src/lib/format.ts`. The original scaffold hard-coded USD in multiple places; keep new price displays going through the shared helper.
