# Platform Catering Talago — Monorepo

## 🎯 Ringkasan

Platform catering B2C/B2B hybrid untuk menjual nasi kotak dengan menu khas Padang di area Pontianak, Kalimantan Barat.

| Persona | Aplikasi | Stack |
|---------|----------|-------|
| **Pelanggan** | `apps/web` — storefront | Astro 7 (SSR, adapter Node) + SolidJS islands |
| **Admin / Dapur / Kurir** | `apps/dashboard` — dashboard internal | TanStack Start + SolidJS + TanStack Query, UI Kobalte (shadcn/ui port, Tailwind v4) |
| **Sistem** | `apps/api` — API + worker | Hono di Node, `ROLE=web` atau `ROLE=worker` (image sama) |
| **Domain** | `packages/core` | TypeScript + Drizzle ORM + SQL atomik |
| **Contract** | `packages/contracts` | Zod schema, enum, DTO, label UI |

**Build & task runner:** Turborepo + pnpm workspaces  
**Database:** PostgreSQL 16 (primary, pooler, PITR)  
**Background queue:** pg-boss (tanpa Redis/broker eksternal)

---

## Struktur Repo

```
apps/
  api/          Hono: rute publik+admin, middleware, worker, entry ROLE
  web/          Astro storefront SSR + Solid islands
  dashboard/    TanStack Start + SolidJS (admin/dapur/kurir)
packages/
  core/         Domain: capacity, orders, checkout, payments, refunds, auth, dst.
    src/modules/<modul>/   schema.ts + service.ts + index.ts
    src/db/                client, schema agregat, migrate, reset
    drizzle/               SQL migrasi (FK fisik terpisah 0001_foreign_keys.sql)
  contracts/    Zod + DTO + enum + label (shared 3 frontend + API)
deploy/         Dockerfile (api/web/dashboard/migrate/dev) + compose dev/staging/prod + env
scripts/        check-boundaries.mjs (lint arsitektur)
docs/           Arsitektur, Docker, API, PRD mapping, ADR, design system
```

**Aturan modul:** tabel sendiri, ekspos lewat `index.ts`, import lintas modul wajib `../<modul>/index` (ditegakkan `pnpm lint`).

---

## 🔑 Keputusan Desain Penting (ADR 0001)

| Kode | Keputusan |
|------|-----------|
| **D1** | Batas porsi/order default **200** (bukan 50 PRD awal), configurable admin. Naikkan → `ensureMinimumHoldCeiling` menaikkan plafon hold hari-hari depan. |
| **D2** | Minimum **50 porsi/order** (total, bukan per menu) — validasi keras server-side. |
| **D3** | `targetMin` = indikator dapur, **tidak** batas checkout. |
| **D4** | `PUT /admin/days/week/{date}` terapkan kapasitas/cut-off/jendela/target ke 1 minggu. |
| **D5** | Menu soft delete (`is_active=false`); order lama pakai snapshot. |
| **D6** | `totalRevenue` hanya order lunas; `grossOrderValue` semua order. |
| **O3** | **Validasi:** `holdCeiling ≥ min(maxPortionsPerOrder, maxRegular)` (ditegakkan di `updateDay`). |

---

## Menjalankan

### Docker (disarankan)

```bash
cp deploy/env/.env.development.example deploy/env/.env.development
docker compose -f deploy/compose.dev.yml up --build
docker compose --profile seed -f deploy/compose.dev.yml run --rm seed
```

| Layanan | URL |
|---------|-----|
| Dashboard | <http://127.0.0.1:3001> |
| Storefront | <http://127.0.0.1:4321> |
| API | <http://127.0.0.1:3000/health> |
| PostgreSQL | `127.0.0.1:5433` (user `catering`, db `catering_dev`) |

**Akun demo:**  
`admin@catering.local / admin12345` · `dapur@catering.local / dapur12345` · `kurir@catering.local / kurir12345`

### Native (tanpa Docker)

```bash
pnpm install
cp .env.example .env
# Sesuaikan DATABASE_URL / DATABASE_URL_TEST
pnpm db:migrate
pnpm db:seed
pnpm dev        # Turbo paralel: api:3000, web:4321, dashboard:3001, worker
```

---

## Perintah Berguna

| Perintah | Fungsi |
|----------|--------|
| `pnpm build` | Build semua (Turbo) |
| `pnpm typecheck` | `tsc --noEmit` + `astro check` |
| `pnpm lint` | ESLint + cek batas modul |
| `pnpm test` / `pnpm test:integration` | Unit / integrasi (DB terpisah, reset schema) |
| `pnpm db:generate` | Generate migrasi Drizzle dari skema |
| `pnpm db:migrate` | Terapkan migrasi |
| `pnpm db:seed` | Seed idempoten (katalog, kapasitas, akun, order demo) |
| `pnpm db:reset` | **Hapus** schema public + migrasi + seed (dev/tes) |
| `pnpm check:docs` | Cocokkan kode error/status di `docs/` dengan `packages/contracts` |
| `pnpm format` | Prettier seluruh repo |

---

## Lisensi

Internal — Catering Talago. Tidak untuk distribusi.
