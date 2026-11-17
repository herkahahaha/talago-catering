# Implementation Plan: Nginx reverse proxy behind Cloudflare (CDN + WAF)

Source spec: none (request from owner, 2026-11-17)

## Overview
Add an Nginx layer between Cloudflare and the existing services so that one origin
serves storefront, API and dashboard. Cloudflare caches only public, read-mostly
endpoints (menu, availability, static assets). Nginx owns routing, same-origin
`/api` (fixes the cross-site cookie risk found earlier), real client IP handling,
and request limits. Application code changes are minimal.

Target topology:
```
Client ── Cloudflare (CDN + WAF) ── Nginx :80/443 ─┬─ web        :4321   (storefront)
                                                    ├─ api        :3000   (/api/v1)
                                                    └─ dashboard  :3001   (admin)
```

## Current state (verified in repo)
- Ports bound to host loopback: API 3000, web 4321, dashboard 3001, Postgres 5433/5434 (dev/staging) — `deploy/compose.*.yml`.
- Prod uses `127.0.0.1:${PORT}` binds; cloudflared (tunnel dev) points directly at `web:4321`, `api:3000`, `dashboard:3001`.
- Dev web uses a Vite `/api` proxy; prod web is a standalone Node build with no proxy, so the browser calls `PUBLIC_API_URL` directly (cross-site cookie risk).
- API already sets CORS with credentials and reads client IP from `x-forwarded-for` / `x-real-ip` (`apps/api/src/lib/http.ts`). Rate limits (`lookup:ip`, `session:ip`) key off this IP.
- Public routes: `/service-area`, `/menu`, `/availability` (cacheable candidates); `/sessions`, `/orders*`, `/auth/*`, `/captcha`, `/quotes`, `/webhooks/payment`, `/dev/*` (never cache).
- No `Cache-Control` headers exist in the API today.
- No `tasks/` directory existed before this plan; nothing overwritten.

## Architecture Decisions
- **Nginx is the single origin behind Cloudflare.** Browsers call `https://<domain>/api/v1/*` on the same host as the storefront, so the `cg_session` cookie is first-party in prod too.
- **Cache only at the edge for allow-listed GET paths.** `/api/v1/menu`, `/api/v1/service-area` may be cached briefly. `/api/v1/availability` gets a short TTL (seconds) because capacity changes with orders. Everything else bypasses cache.
- **Cache keys never include cookies.** Any request carrying `cg_session` or `cg_staff` bypasses cache, so per-customer data cannot leak.
- **Real client IP:** Nginx trusts only Cloudflare IP ranges and sets `X-Forwarded-For` from `CF-Connecting-IP`. Without this, per-IP rate limits would see Cloudflare's address.
- **Webhooks are not public-cacheable and should be restricted.** `/api/v1/webhooks/payment` must never be cached; signature check stays in the app.
- **Dashboard gets an extra guard** (Cloudflare Access or IP allow-list) as a WAF rule, not in app code.
- **Keep the existing `127.0.0.1` port binds.** Nginx is the only public listener; services stay on loopback or the Docker network.

## Task List

### Phase 1: Foundation (no behavior change)

- [ ] **Task 1: Nginx service in compose (dev) with the three upstreams** — size S
  - Acceptance: `docker compose … up nginx` serves `/` → web, `/api/v1/health` → api, `/admin` or dashboard host → dashboard; existing direct ports still work.
  - Verify: `curl -H "Host: localhost" http://127.0.0.1:8080/` returns storefront HTML; `/api/v1/menu` returns the API envelope.
  - Depends on: none. Files: `deploy/compose.dev.yml`, `deploy/nginx/dev.conf`.

- [ ] **Task 2: Same-origin `/api` routing and cookie check** — size S
  - Acceptance: browser calls `/api/v1/*` on the storefront host; `POST /api/v1/sessions` sets `cg_session` that is sent on later `/api/v1/orders/mine`.
  - Verify: DevTools shows 200 on `/orders/mine` after checkout; no CORS errors.
  - Depends on: Task 1. Files: `deploy/nginx/dev.conf`, `apps/web/src/lib/client.ts` (only if `PUBLIC_API_URL` default needs changing).

- [ ] **Task 3: Real client IP and proxy trust** — size S
  - Acceptance: API logs and rate-limit keys show the visitor IP, not Nginx's IP. Requests with a spoofed `X-Forwarded-For` from outside Cloudflare are rejected or ignored.
  - Verify: send two requests from different client IPs via `CF-Connecting-IP` (test header); `ratelimit` buckets differ.
  - Depends on: Task 1. Files: `deploy/nginx/*.conf`, `apps/api/src/lib/http.ts` (trust-proxy setting if needed).

### Checkpoint: Foundation
- [ ] Storefront, API and dashboard reachable through Nginx in dev
- [ ] Checkout works end-to-end in a browser through Nginx
- [ ] Existing direct ports still work (rollback path)

### Phase 2: Caching and WAF

- [ ] **Task 4: Cache policy for public GET endpoints in Nginx** — size S
  - Acceptance: `/api/v1/menu` and `/api/v1/service-area` return `Cache-Control: public, max-age=…`; `/api/v1/availability` short TTL; any request with a cookie bypasses cache.
  - Verify: two identical requests show `X-Cache-Status: HIT` on the second; a request with `Cookie: cg_session=…` shows `BYPASS`.
  - Depends on: Task 2. Files: `deploy/nginx/*.conf`, `apps/api/src/routes/public.ts` (add `Cache-Control` on those three routes only).

- [ ] **Task 5: Invalidation on menu/capacity change** — size M
  - Acceptance: after a menu edit or a capacity change in the dashboard, the storefront shows the new value within the configured TTL (target ≤ 60 s for availability, ≤ 5 min for menu).
  - Verify: edit a menu item, reload storefront after TTL, value updated; no stale availability after an order is placed.
  - Depends on: Task 4. Decide: TTL only (simplest) or purge via Cloudflare API on write (`apps/api` admin routes). Recommend TTL first, purge later.

- [ ] **Task 6: Cloudflare configuration as code (documented)** — size S
  - Acceptance: documented cache rules (paths, bypass on cookies), WAF managed rules on, rate-limit rule on `/api/v1/orders*` and `/api/v1/auth/*`, Access/IP rule on dashboard host.
  - Verify: `curl` from outside returns Cloudflare headers (`cf-ray`); a blocked test payload returns 403 from WAF.
  - Depends on: Tasks 3–4. Files: `docs/docker.md` (ops section), `deploy/cloudflare/README.md`.

- [ ] **Task 7: Security headers at Nginx** — size XS
  - Acceptance: `X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options` set once at Nginx; not duplicated with `apps/web/src/middleware.ts` (remove duplicates or keep one source).
  - Verify: `curl -I` shows one value per header.
  - Depends on: Task 1.

### Checkpoint: Caching and WAF
- [ ] Cache HIT/BYPASS verified for public vs cookie requests
- [ ] No cached response contains per-customer data (grep responses for order/customer fields with cookie-less request)
- [ ] WAF blocks a known-bad test request

### Phase 3: Production and staging

- [ ] **Task 8: Nginx in `compose.staging.yml` and `compose.prod.yml`** — size M
  - Acceptance: Nginx is the only published port (80/443); web/api/dashboard stay on `127.0.0.1` or internal network; `PUBLIC_API_URL` set to the same-origin path (or unchanged, if Task 2 covers it).
  - Verify: `docker compose -f deploy/compose.prod.yml config` renders no public port except Nginx.
  - Depends on: Checkpoint: Caching and WAF. Files: `deploy/compose.prod.yml`, `deploy/compose.staging.yml`, `deploy/env/*.example`.

- [ ] **Task 9: Staging smoke test before prod** — size S
  - Acceptance: full checkout, OTP, lookup, cancel, and webhook path pass on staging through Cloudflare + Nginx.
  - Verify: run existing `scripts/load-checkout.js` at low concurrency; manual checkout in two browsers.
  - Depends on: Task 8.

- [ ] **Task 10: Rollback runbook** — size XS
  - Acceptance: documented steps to switch DNS/Cloudflare route back to direct `web`/`api` without data loss.
  - Verify: dry-run on staging.
  - Depends on: Task 8. File: `docs/docker.md`.

### Checkpoint: Complete
- [ ] All acceptance criteria met on staging
- [ ] Prod cut-over reviewed by owner
- [ ] Rollback tested

## Risks and Mitigations
| Risk | Impact | Mitigation |
|------|--------|------------|
| Caching serves stale availability, allowing oversell | High | Short TTL on `/availability`; server-side capacity check still authoritative at `POST /orders` (already transactional). Verify with Task 5. |
| Cache leaks per-customer data | High | Bypass any request with cookies; cache only allow-listed paths; test in Task 4 and checkpoint. |
| Per-IP rate limits see Cloudflare/Nginx IP | High | Task 3: trust only Cloudflare ranges, read `CF-Connecting-IP`. |
| Spoofed `X-Forwarded-For` bypasses rate limits | High | Nginx overwrites the header; reject untrusted sources. |
| Webhook blocked or cached by WAF | High | Exempt `/api/v1/webhooks/payment` from WAF challenge; keep signature verification in app; test with mock settle. |
| Cookie/CORS issues in prod (cross-site) | Medium | Same-origin `/api` via Nginx (Task 2). |
| Duplicate security headers (Nginx + Astro middleware) | Low | Task 7. |
| Staging/prod drift from dev Nginx config | Medium | One shared `deploy/nginx/` base with per-env includes. |

## Open Questions
- Domain names for storefront, API and dashboard (single host with paths, or subdomains)? This decides cookie scope and whether Task 2 is needed.
- Is Cloudflare Access available for the dashboard, or should it use an IP allow-list?
- Acceptable staleness for menu and availability (proposed: availability ≤ 60 s, menu ≤ 5 min)?
- TLS: Cloudflare-managed certificate only, or also a certificate on the origin (Cloudflare "Full (strict)")?
- Should the Cloudflare tunnel (`compose.tunnel.dev.yml`) be replaced by Nginx upstream, or stay as the origin connector?

## Human review
- [ ] Human has reviewed and approved this plan before Phase 1 starts.
