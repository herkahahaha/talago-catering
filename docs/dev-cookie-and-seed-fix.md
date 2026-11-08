# Dev-flow fix: empty dashboard + "Sesi tamu tidak ditemukan"

Date: 2026-11-07. Scope: `deploy/compose.dev.yml` dev loop only.
Staging/production untouched (they bake absolute API URLs at build time).

## Symptoms

1. After `up --build` + `run --rm seeds`, no dummy data visible at `localhost:3001`.
2. `localhost:4321/checkout` fails with `Sesi tamu tidak ditemukan`.

## Root causes (all confirmed, not assumed)

### A. Seed never ran — two compounding errors

- Wrong service name: the service is `seed` (singular, `deploy/compose.dev.yml:142`),
  not `seeds`.
- Worse: even the documented singular command was broken. `seed` declares
  `profiles: ['seed']`, and Compose omits profiled services unless the profile is
  enabled — verified via `docker compose config --services` (no `seed` without
  `--profile seed`). So `docker compose -f deploy/compose.dev.yml run --rm seed`
  and `pnpm docker:dev:seed` both failed with "no such service".

Fix: `docker compose --profile seed -f deploy/compose.dev.yml run --rm seed`
in `package.json`, `README.md`, `doc-docker/README.md`, `doc-docker/docker.md`
(§6.2, §6.5), and the `compose.dev.yml` header/seed comments.

### B. Guest/staff cookies lost cross-site

`CheckoutFlow.submit` does `POST /sessions` then `POST /orders` as cross-origin
fetches with `credentials: 'include'` (`apps/web/src/islands/CheckoutFlow.tsx`,
`apps/web/src/lib/client.ts`). The `cg_session` cookie is `SameSite=Lax`,
host-only (`apps/api/src/lib/session.ts:19-27`). Opening the page at
`localhost:4321` while `PUBLIC_API_URL=http://127.0.0.1:3000` is **cross-site**
(`localhost` ≠ `127.0.0.1`), so the Lax cookie was never sent back and
`POST /orders` arrived cookieless → `requireGuest` threw exactly the reported
message (`apps/api/src/lib/session.ts:63-67`). Same flaw hit the dashboard
staff cookie (`cg_staff`) on `localhost:3001`. CORS config was fine
(`apps/api/src/app.ts:12-19`) — cookies, not CORS, were the issue.

Fix: same-origin `/api` proxies in dev, so cookies are always first-party
regardless of hostname:

| File | Change |
| :--- | :----- |
| `apps/web/astro.config.mjs` | `vite.server.proxy`: `/api` → `API_BASE_URL` (dev only) |
| `apps/web/src/lib/client.ts` | browser uses relative `/api/v1` when `PUBLIC_API_URL` empty; SSR keeps absolute `API_BASE_URL` |
| `apps/web/src/middleware.ts` | `\|\|` fallbacks so empty env doesn't poison CSP origin |
| `apps/dashboard/vite.config.ts` | explicit `devApiProxy` middleware plugin (`apply: 'serve'`) |
| `apps/dashboard/src/lib/api.ts` | same relative/absolute split on `VITE_API_URL` / `window` |
| `deploy/compose.dev.yml` | `PUBLIC_API_URL: ''` (web), `VITE_API_URL: ''` (dashboard) — wins over stale `.env.development` copies |
| `deploy/env/.env.development.example` | both vars documented as intentionally empty in dev |

Why a hand-written plugin for the dashboard: TanStack Start's dev server ignores
both vite `server.proxy` and nitro `devProxy` (tried both — `/api/*` still
returned the SPA shell). The explicit `server.middlewares.use('/api', …)`
plugin runs first in the chain and forwards method/headers/body, streams the
response incl. `Set-Cookie`, and is excluded from production builds.

### C. Secondary trap (documented, not a bug)

Dashboard defaults to the current month (`routes/index.tsx:55`) but seed dates
are tomorrow → +14d. Near month-end the 3 demo orders land next month and the
default view looks empty. Added to the troubleshooting table.

## Verification (live, stack up)

- `docker compose config` OK; `pnpm typecheck` 5/5; `pnpm lint` 5/5.
- `pnpm docker:dev:seed` → seed ran ("Seed selesai" / already-seeded path).
- `GET :4321/api/v1/availability` → real JSON (proxy works).
- `POST :4321/api/v1/sessions` + `GET :4321/api/v1/orders/mine` with one cookie
  jar → `{"orders":[]}` (was 401 before).
- `POST :3001/api/v1/admin/auth/login` (admin@catering.local) + overview
  `?month=2026-11` → 3 demo orders, 190 portions — the "missing dummies".

## Strategy notes for next time

1. Reproduce the cookie path with `curl -c/-b` through the same origin the
   browser uses before touching code — it distinguishes cookie loss from CORS
   in one step.
2. `docker compose config --services` (with/without `--profile`) is the ground
   truth for "no such service" — don't trust documented commands.
3. Dev proxies must be verified per frontend: Astro honors `vite.server.proxy`,
   TanStack Start dev does not — test `/api/v1/health` through each port after
   any proxy change.
