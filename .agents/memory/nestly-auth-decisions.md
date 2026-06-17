---
name: Nestly auth decisions
description: Durable auth/access-control decisions for Nestly (Clerk) — the non-obvious tradeoffs behind the implementation.
---

# Nestly auth decisions

## Clerk is cookie-auth on web — never add Bearer/getToken
Replit-managed white-label Clerk. The web app and API are served **same-origin**
behind the Replit proxy, so the browser sends Clerk's session **cookie**
automatically on same-origin fetches. The server derives identity with
`getAuth(req).userId`.
**Why:** Mixing in `getToken()`/Authorization headers is redundant and invites
inconsistent auth paths. **How to apply:** protected routes use `requireAuth`
(401 if no `userId`); identity comes only from Clerk, never from body/query.

## CORS must NOT reflect arbitrary origins
Because auth is cookie-based, `cors({ origin: true, credentials: true })` is a
CSRF surface. We allow only the app's own origins, built from `REPLIT_DOMAINS`
(+ `REPLIT_DEV_DOMAIN`, + localhost in dev); unknown origins get no
`Access-Control-Allow-Origin`.
**Why:** same-origin proxy means we never legitimately need cross-site
credentialed requests. **How to apply:** if frontend/API are ever split to
different origins, add `credentials: 'include'` on the client AND keep the strict
allowlist — do not loosen to reflect-all.

## JIT user provisioning is fire-and-forget today — make it awaited for shared data
`requireAuth` kicks off `ensureUserRow(userId)` (best-effort upsert of a Clerk
profile snapshot into our `users` table) without awaiting. Insert is race-safe
via `onConflictDoNothing`.
**Why:** favorites don't need the `users` row to exist, so we don't pay latency.
**How to apply:** any route that READS the `users` row (NestlyGroup membership,
seller ownership, FindIT) must `await` provisioning (or query users itself) —
don't assume the row exists yet. Under polling-heavy chat, replace the
per-request SELECT with a cached/awaited ownership helper.

## Favorites snapshot the listing payload on purpose — provenance is a P3 concern
`POST /favorites` stores the client-supplied `propertyData` (Zod shape-validated)
rather than just a `propertyId` hydrated server-side.
**Why:** the live-listing store is **in-memory and lost on restart**, so
hydrating by id would make saved homes vanish after a server restart — a
regression. A snapshot is scoped to the saving user's own collection, so a forged
payload only pollutes their own view (no cross-user leak, no effect on public
Firecrawl search/featured).
**How to apply:** the "only real listings" integrity risk becomes real when a
listing is **shared to others** (NestlyGroup P3 / seller P4). At that boundary,
validate/hydrate the shared listing against a server-side real-listing source
(requires DB-persisting listings first) instead of trusting the snapshot.
