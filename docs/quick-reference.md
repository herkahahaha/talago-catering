# Project Summary — Deepseek Harness

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
- PostgreSQL 16 native at `127.0.0.1:5432` (db `catering_dev` / `catering_test`, user `catering`, password `catering_dev_pw`)
- Container dev uses host port `5433`

## Key Business Rules

### Portions & Capacity
- **Default max portions per order**: 200 (was 50 in initial PRD, now configurable by admin)
- **Minimum per order**: 50 (hard validation before reserve)
- **Per-day partitions**: `max_regular` + `max_po <= kitchen_max_total`
- **PO (Purchase Order)**: 500–1000 portions, separate from regular capacity but shared kitchen total
- **Target minimum produksi**: Indicator only for dapur; does NOT limit checkout
- **Hold ceiling**: Default 50% of `max_regular`, bounded by `max_regular` and current held count

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

### Admin Routes (need `cg_staff` cookie)
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
```
pending_payment ──paid──► paid ──► in_production ──► out_for_delivery ──► delivered
      │                    │
      │ hold habis         │ dibatalkan
      ▼                    ▼
   expired          cancelled_refunded
      │
      └── pembayaran telat ──► paid (if sisa) / paid_after_expiry + refund (jika penuh)
```

Only forward transitions allowed via API admin; corrections recorded in audit log.

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

## Docker Deployment

### Compose Files
Three separate compose files: `deploy/compose.dev.yml`, `deploy/compose.staging.yml`, `deploy/compose.prod.yml`
- Optional `compose.prod.db.yml` for self-hosted Postgres
- Dev uses `Dockerfile.dev` + bind mount `src/` for hot reload
- Staging/production use immutable image with version tag

### Services
- **API image** (`deploy/Dockerfile.api`): Two roles — `ROLE=web` (:3000) and `ROLE=worker` (no public port)
- **Storefront** (`deploy/Dockerfile.web`): `:4321`, `PUBLIC_API_URL` injected at build time
- **Dashboard** (`deploy/Dockerfile.dashboard`): `:3001`, `VITE_API_URL` injected at build time
- **Migrate**: Runs before API/worker/web/dashboard; app waits for migration success

### Production Setup (runbook)
```bash
cp deploy/env/.env.production.example deploy/env/.env.production
# isi DATABASE_URL, SESSION_SECRET, CAPTCHA_SECRET, PAYMENT_WEBHOOK_SECRET,
# PUBLIC_API_URL, APP_URL, DASHBOARD_URL, IMAGE_TAG
docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml up -d
```

### Reverse Proxy & TLS
- Cloudflare CDN + WAF in front
- HTML guest pages NOT fully cached (cookie session dynamic)
- Cache only: `/menu`, `/availability`, static assets

### Secrets & Configuration
- `.env` local already gitignored
- Production: rotate `SESSION_SECRET` (invalidates old links & OTP), `CAPTCHA_SECRET`, `PAYMENT_WEBHOOK_SECRET`
- Staff passwords: scrypt (`N=16384,r=8,p=1`); change via seed/admin; active sessions not auto-invalidated

## Dashboard Design System (Kobalte)

### Stack
- **Tailwind v4** + `@tailwindcss/vite`
- **Kobalte** primitives (SolidJS equivalents of Radix UI)
- **class-variance-authority** (CVA) for component variants
- **lucide-solid** icons (lucide-react counterpart)
- **tw-animate-css** for SSR-aware animations

### Tokens (light mode only)
Defined in `:root` on `app.css`, mapped to Tailwind via `@theme inline`:
- `--background`/`--foreground`
- `--card`/`--card-foreground`
- `--popover`/`--popover-foreground`
- `--primary`/`--primary-foreground`
- `--secondary`
- `--muted`/`--muted-foreground`
- `--accent`
- `--destructive`
- `--border`/`--input`/`--ring`
- `--sidebar` and derivatives
- `--radius` (0.625rem) with `sm/md/lg/xl` variants

### Components (all in `apps/dashboard/src/components/ui/`)
| Komponen | File | Primitif |
|----------|------|----------|
| Button | `button.tsx` | CVA |
| Badge | `badge.tsx` | — |
| Card + variants | `card.tsx` | — |
| Input | `input.tsx` | — |
| Label | `label.tsx` | — |
| Select | `select.tsx` | Kobalte Select |
| Checkbox | `checkbox.tsx` | Kobalte Checkbox |
| Table + variants | `table.tsx` | — |
| Alert + 5 varian | `alert.tsx` | CVA |
| Dialog | `dialog.tsx` | Kobalte Dialog |
| AlertDialog | `alert-dialog.tsx` | Kobalte AlertDialog |
| DropdownMenu | `dropdown-menu.tsx` | Kobalte DropdownMenu |
| Sheet | `sheet.tsx` | Kobalte Dialog |
| Separator | `separator.tsx` | — |
| Progress | `progress.tsx` | — |
| Skeleton | `skeleton.tsx` | — |
| Toast | `toast.tsx` | Custom |
| EmptyState | `empty-state.tsx` | Custom |
| StatCard | `stat-card.tsx` | Custom (Card) |

### Usage Patterns
- Buttons: `buttonVariants({ variant: 'default|destructive|outline|secondary|ghost|link' })`
- Select: controlled, value as string; empty string = placeholder
- Dialog form: `DialogTitle` **wajib** for accessibility
- AlertDialog: for destructive/bulk actions (not `window.confirm`)
- Row actions: `DropdownMenu` with Edit, Toggle Active, etc.
- Tables: `min-w-[…]` + `overflow-x-auto` for mobile
- Feedback: Alert variants, Toast (3 sec), EmptyState for empty tables

### Layout & Responsif
- **Sidebar**: fixed 256px (`md:flex`); brand, operational groups, user menu
- **Sheet**: mobile from left; hamburger < `md`
- **Header**: sticky 56px; breadcrumb, today chip (`≥ lg`), avatar + logout mobile
- **Content**: max 1440px, responsive padding
- **Grid**: stats 1 col → 2 (`sm`) → 4 (`xl`); two-column layouts stack on mobile

### Print Mode
- Recap production printable: `data-slot="sidebar"`, `data-slot="header"`, `data-slot="app-main"` handled at `@media print`
- Interactive elements get `no-print` class
- `.print-sheet` removes borders/shadows, keeps black-and-white table
- Result: work sheet for dapur only

### Accessibility
- Focus ring: `focus-visible:ring-[3px] ring-ring/50`
- Kobalte Dialog/Sheet/AlertDialog/Select: focus trap, ESC, ARIA, keyboard nav
- Icon-only triggers: `aria-label`
- Tables: `<th>` for columns; status not color-only labeled
- `aria-current="page"` on active nav
- Money numbers: `tabular-nums`

### Adding New shadcn Component
1. Get reference from ui.shadcn.com or port Solid version
2. Rewrite in `components/ui/<nama>.tsx`
3. Use `data-slot="…"` and `cn()`; keep token names consistent (`bg-card`, `text-muted-foreground`, etc.)
4. Use Kobalte primitive for interaction; ensure SSR (portal only renders when open)
5. Add to document inventory and optional usage example
6. Run `pnpm --filter @catering/dashboard lint typecheck build`; test keyboard & mobile

### Verification Checklist (already run)
- Login/logout, 401 redirect, user menu
- Order list: month/status filter, search, pagination, row click
- Menu: add/edit dialog, save, toggle active via dropdown
- Order detail: status change, internal notes, cancel dialog (required reason)
- Day settings: capacity, checkout rules, window, weekly apply, production recap, print
- Refund, quotations, audit log
- Order manual/PO: form, summary, success state
- Mobile: Sheet nav, horizontal table scroll, form stacking
- Build production (staging)

## Roadmap / Next Steps (from session summary)

1. **Gateway pembayaran asli** (Midtrans/Xendit) — PaymentGateway + signature verification
2. **Notifikasi nyata** (SMTP/Whatsap Business API) — outbox worker masih mock
3. **CI pipeline** — build/push image ke registry + otomasi deploy ke server
4. **Load test** (`scripts/load-checkout.js`) — uji restore/PITR, injeksi & otorisasi formal
5. **CSP nonce** di Cloudflare/WAF, rate limit IP di edge
6. **Fase 2**: kurir PWA, refund otomatis, ubah order, invoice, multi-tanggal
7. **Fase 3**: akun/loyalitas
8. **Commit awal repo** — belum ada commit sebelum handoff ke tim

## Critical Risks
- Gateway asli belum dipasang; perilaku QRIS/VA nyata (termasuk biaya refund) belum divalidasi
- Parameter anti-bot (plafon hold, cap porsi) masih nilai awal; perlu disetel lewat load test & observasi soft launch
- Jendela antar masih opsional karena keputusan #9 belum final
- Data Mejamakan/Kendixpress dari v1 tidak diverifikasi ulang; alur Kendixpress belum dijadikan acuan implementasi

## File References
- `AGENTS.md` — Project context (this file)
- `docs/api.md` — Full API v1 specification
- `docs/architecture.md` — System architecture & module map
- `docs/prd-mapping.md` — PRD → implementation mapping table
- `docs/runbook.md` — Operational runbook (deploy, check, refund, backup, incidents)
- `docs/docker.md` — Docker dev/staging/prod guides
- `docs/dashboard-ui.md` — shadcn/ui design system for dashboard
