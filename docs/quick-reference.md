---
language: en-US
---
# Project Summary — Catering Talago

## Project Overview
- **Type**: Monorepo Turborepo + pnpm
- **Packages/Apps**: 
  - `apps/api` — Hono (Node.js) API
  - `apps/web` — Astro 7 SSR + SolidJS islands (storefront)
  - `apps/dashboard` — TanStack Start + SolidJS (admin)
  - `packages/core` — Domain + Drizzle SQL
  - `packages/contracts` — Zod DTO, enums, labels
- **Status**: Development paused; Docker stack stopped. All apps can run via separate dev/staging/prod compose files.
- **Last verification**: 18 unit + 26 integration tests green, build/lint/typecheck pass.

## Stack & Commands

### Development
- **Docker**: `pnpm docker:dev:up` then `pnpm docker:dev:seed`
- **Native**: `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:dashboard`, `pnpm dev:worker`
- **All apps**: `pnpm dev`

### Verification
- `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`, `pnpm test:integration`

### Database
- **Migration**: `pnpm db:migrate`; reset+seed dev: `pnpm db:reset`
- PostgreSQL 16 native at `127.0.0.1:5432`
- Container dev uses host port `5433`

## Key Business Rules

### Portions & Capacity
- **Default max portions per order**: 200 (was 50 in initial PRD, now configurable by admin)
- **Minimum per order**: 50 total semua menu (hard validation before reserve; ADR 0001 O1)
- **Per-day partitions**: `max_regular` + `max_po <= kitchen_max_total`
- **PO (Purchase Order)**: orders above the per-order limit (default >200) go through quotation; `max_po` defaults to 500 per day, separate from regular capacity but sharing `kitchen_max_total` (default 1000)
- **Target minimum produksi**: Indicator only for dapur; does NOT limit checkout (ADR 0001 O2)
- **Hold ceiling**: Default 50% of `max_regular`, bounded by `max_regular` and current held count. Must be ≥ min(`max_portions_per_order`, `max_regular`) (ADR 0001 O3, enforced in `updateDay`)

### Checkout Rules
- **Minimal 50 porsi** per order; **default max 200** (configurable admin via `PUT /admin/settings/order`)
- **Soft delete menu**: `is_active = false`; orders use snapshot
- **Hold**: 10 minutes from `hold_expires_at`; auto-cleaned by sweep job each minute
- **CAPTCHA**: Required before reservation; HMAC challenge/turnstile
- **Idempotency-Key**: Required (8–128 chars); replay returns same order; different payload → `IDEMPOTENCY_CONFLICT`
- **Cut-off**: H-1 18:00 WIB per tanggal; after cut-off, no new orders via API (admin can still create manual orders)
- **Weekly application**: Capacities, cut-off, target minimum, and window settings applied weekly (Mon–Sun); menu per date does NOT change

### Status Flow
```
pending_payment ──paid──► paid ──► in_production ──► out_for_delivery ──► delivered
      │                    │
      │ hold habis         │ dibatalkan
      ▼                    ▼
   expired          cancelled_refunded
      │
      └── pembayaran telat ──► paid (if sisa kapasitas) / paid_after_expiry + refund (jika penuh)
```

### Refund (soft launch)
- Manual process: dashboard → Refund → filter `queued` → process payment → mark `completed`
- System marks refund `completed`, changes payment to `refunded`, sends mock notification

### Rate Limiting
- **Admin**: 300 requests/min per staf
- **Per IP**: 3/hour (rate_limits table, key `order:ip:*`)
- **Per phone number**: Adaptive OTP after 2 expired holds or hold exceeding limit
- **CAPTCHA**: Before hold; replay idempoten doesn't require new CAPTCHA

### Payment
- **Mock gateways**: QRIS/VA/tunai + webhook HMAC idempotent
- **Webhook signature**: `x-payment-signature: <hex HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET)>`
- **Idempotent per `eventId`**: Duplicates → `duplicate` status, no double effect
- **Late paid**: `paid_after_expiry` status + refund `queued` if capacity full

## API v1 Endpoints (Public)

### Guest Routes
- `POST /sessions` — Create guest session (name + phone + consent)
- `GET /service-area` — Check zone & ongkir (free, single zone Pontianak)
- `GET /menu?date` — Scheduled dishes + remaining portions
- `GET /availability?from&days` — Remaining portions & 1–30 day window
- `POST /captcha` — Arithmetic challenge HMAC-signed
- `POST /orders` — Create order (needs cookie, idempotency key, captcha token)
- `GET /orders/mine` — Orders for this device
- `POST /orders/lookup` — Find order by orderNo + phone (rate limit 10/10 min)
- `GET /orders/{token}` — Status via signed token (30 min) or raw token hash
- `POST /orders/{id}/cancel` — Cancel before cut-off
- `POST /orders/{id}/payment-retry` — New charge while hold valid
- `POST /quotes` — Quotation request for orders above the per-order limit
- `POST /webhooks/payment` — Payment gateway webhook (HMAC signature, idempotent per `eventId`)
- `POST /dev/payments/{gatewayRef}/settle` — Dev-only mock settlement
- `GET /health` — Health check

### Admin Routes (need `cg_staff` cookie, except `/admin/auth/*`)
- `POST /admin/auth/login`, `POST /admin/auth/logout`, `GET /admin/auth/me` — Staff session
- `POST /admin/auth/otp`, `POST /admin/auth/verify` — Adaptive OTP challenge
- `PATCH /admin/orders/{id}/status` — Forward-only status transition (audited)
- `POST /admin/orders/{id}/notes`, `GET /admin/orders/{id}/refunds` — Order notes, refunds of one order
- `GET|PUT /admin/days/{date}/menu` — Menu schedule for one date
- `PUT /admin/days/week/{date}` — Apply weekly settings (Mon–Sun)
- `GET /admin/overview?month=YYYY-MM` — Total orders, revenue, portions, daily breakdown
- `GET /admin/settings/order` — Global checkout rules (min, max per order, hold)
- `PUT /admin/settings/order` — Update checkout rules
- `GET /admin/catalog` — Full menu with active status & schedule count
- `POST /admin/menu` — Add dish (auto-schedule 14 days)
- `PATCH /admin/menu/{id}` — Toggle active/inactive (soft delete)
- `DELETE /admin/menu/{id}` — Soft delete menu
- `GET /admin/orders?date=` — Orders for one day + capacity summary
- `GET /admin/orders?from&to&status&q&page&pageSize` — Orders range (full month)
- `GET /admin/days/{date}` — Capacity + window for date
- `PUT /admin/days/{date}` — Update capacity, cut-off, target, window
- `GET /admin/production?date` — Production recap
- `GET /admin/stats?date` — Daily stats
- `GET /admin/refunds?status` — Refund list
- `POST /admin/refunds/{id}/complete` — Mark refund completed
- `GET /admin/audit?date&entity&limit` — Audit log
- `GET /admin/quotations` — Quotation requests

## Architecture

### Topology
```
Cloudflare (CDN + WAF)
    │
    ├── apps/web (Astro SSR, storefront tamu)
    ├── apps/api (Hono, ROLE=web, 2 instances autoscale)
    ├── apps/dashboard (TanStack Start, internal, origin terpisah)
    │
    └── packages/contracts (shared Zod DTO/enums)
        │
        PostgreSQL 16 (primary, pooler, PITR)
        │
        packages/core (domain/Drizzle)
        │
        apps/api (ROLE=worker, 1 small container) — pg-boss
```

- Single modular monolith; no Redis, broker, search, or microservices
- Worker uses **same image** as web; only `ROLE` differs
- All frontends talk to single API `/api/v1`; types shared via `packages/contracts`
- Migrate service runs before API/worker/web/dashboard; app waits for migration success

### Modules (`packages/core/src/modules`)
| Modul | Tabel | Fungsi Publik |
|-------|-------|--------------|
| settings | settings | Konfigurasi runtime (default PRD §2/§5) |
| catalog | menu_items, menu_schedule | Menu per tanggal, jadwal hidangan |
| capacity | daily_capacity | Partisi harian, reservasi atomik, pengaturan hari |
| delivery | delivery_windows, deliveries | Jendela antar, stop, status kirim |
| customers | customers, addresses, guest_sessions | Sesi tamu, zona, data pelanggan |
| orders | orders, order_items, idempotency_keys | Siklus hidup order, idempotensi, produksi |
| payments | payments, webhook_events | Tagihan, gateway adapter, dedupe webhook |
| refunds | refunds | Kebijakan refund manual |
| checkout | — (orkestrasi) | Checkout tamu, webhook, pembatalan, order admin |
| auth | staff_users, staff_sessions, otp_challenges | Login staf, sesi, OTP adaptif |
| security | rate_limits, captcha_challenges | Rate limit DB, CAPTCHA |
| audit | audit_log | Jejak audit semua transisi |
| notifications | notifications | Outbox email/WhatsApp |
| quotations | quotations, purchase_orders | Jalur penawaran di atas batas order |

**Rule**: Modul only exposes `index.ts`; `pnpm lint` runs `scripts/check-boundaries.mjs` and rejects cross-module imports.

### Capacity Model
- One `daily_capacity` row per date is the atomic key
- Partitions: `reserved_regular`, `held_regular`, `max_regular`, `hold_ceiling`
- CHECK constraints in DB: `max_regular + max_po <= kitchen_max_total`, `held <= reserved`, non-negative
- Reservations run in single transaction: lazy expiry → release → conditional reserve
- 5000 concurrent reservation tests: only 4 succeed for capacity 200 with 50 portions per trial; never exceeds max

### State Machine Order (one-way only)
Diagram: see **Status Flow** above. Only forward transitions are allowed via admin API; corrections are recorded in the audit log.

### Webhook Payment (PRD §4.3)
1. Verify HMAC-SHA256 signature on raw body → fail: 401 + audit, no effect
2. Dedupe `event_id` (`webhook_events` unique). Duplicate → `duplicate`, no double effect
3. Match `gateway_ref` and amount; mismatch → ignore + audit
4. `settled`:
   - order `pending_payment` and hold active → `paid`, `held` reduced
   - hold expired → expire then atomik re-reserve (including window stops)
     - Success → `paid`. Full → `paid_after_expiry`, refund `queued`, notification
5. `failed`/`expired` → update payment status; hold will normally expire
6. Every step writes `audit_log` and marks event `processed_at`


## File References
- `AGENTS.md` — Project context (this file)
- `docs/api.md` — Full API v1 specification
- `docs/architecture.md` — System architecture & module map
- `docs/prd-mapping.md` — PRD → implementation mapping table
- `docs/runbook.md` — Operational runbook (deploy, check, refund, backup, incidents)
- `docs/docker.md` — Docker dev/staging/prod guides
- `docs/dashboard-ui.md` — shadcn/ui design system for dashboard
- `docs/design-web.md` — material 3 design system for storefront
- `docs/adr/0001-batas-order-dan-target-produksi.md` — decision record for order limit and production target
- `docs/README.md` — index of all docs
