---
name: Nestly data honesty (P2 detail + per-user collections)
description: How the "real listings only / honest Not available" rule applies to derived metrics and per-user snapshots, plus the notification badge refetch gotcha.
---

# Derived metrics are NOT source fields

`pricePerSqft` is **always computed** (`price / sqft`) in `firecrawlSearch.ts` — it is never extracted from the listing source (not in `DETAIL_SCHEMA`/`DETAIL_PROMPT`). So a frontend "show Not available when null" guard does nothing for it: it is never null when price+sqft exist.

**Rule:** never present a derived value as if the source stated it. Either drop it, or label it as derived. We label it "Price / sqft (calculated)" in `PropertyDetails.tsx`.

**Why:** the hard product rule is "no fabricated/sample data." Transparent arithmetic on two real observed numbers is allowed, but it must be visibly marked as calculated so users don't read it as a source-reported figure.

**How to apply:** if you add another computed metric (e.g. estimated mortgage, $/bed), label it calculated/est. Only fields actually extracted from the source page may appear as plain source facts.

# Per-user collections store client snapshots BY DESIGN

`favorites` and `visited_properties` persist the full `propertyData` snapshot sent by the client, not just a `propertyId`.

**Why:** the property detail store (`propertyStore`) is in-memory and cleared on every api-server restart (dev workflow is `build && start`, no watch). Hydrate-by-id would 404 a user's saved/visited homes after any restart. Snapshots keep collections intact across restarts.

**Accepted tradeoff:** a signed-in user could POST a hand-crafted fake listing into their OWN favorites/visited. That only pollutes that one user's private view — it is never shown in public search or to other users — so it does not violate the "app never shows fabricated market data" requirement. Do NOT "fix" this by switching to hydrate-by-id; that would regress restart-survival. If real integrity is ever needed, verify the snapshot against `getStoredProperty(id)` / source host WITHOUT dropping the snapshot fallback, and change favorites + visited together (keep them consistent).

# Notification badge is a separate query

The unread-count badge (`useGetUnreadNotificationCount`) and the dropdown list (`useListNotifications`) are independent queries.

**Rule:** after any mark-read mutation (one or all), refetch BOTH — refetching only the list leaves the badge stale until its 60s interval. See the `Promise.all([refetch(), refetchCount()])` calls in `NotificationBell.tsx`.
