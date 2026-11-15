# Platform Catering Talago — Monorepo

**Implementasi thin slice dari *System Design v2: Platform Catering Online* (PRD revisi CTO, 29 Okt 2026).**  
Satu monolith modular, satu PostgreSQL 16, tiga frontend untuk tiga persona.

---

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

## ✅ Yang Sudah Berjalan (Fase 1a–1d *thin slice*)

| Area | Detail |
|------|--------|
| **Kapasitas atomik** | `daily_capacity` per tanggal; reservasi dalam 1 transaksi (lazy expiry → reserve). Tes 5.000 konkuren lolos tanpa melewati `max_regular`. |
| **Batas order** | Min 50 porsi/order, max 200 (configurable admin lewat `PUT /admin/settings/order`). Di atas → quotation (`ORDER_TOO_LARGE`). Target produksi (`targetMin`) **bukan** batas checkout. |
| **Checkout tamu** | Sesi cookie httpOnly, CAPTCHA HMAC, Idempotency-Key, hold 10 menit, plafon hold per nomor/IP. |
| **Pembayaran** | Gateway `mock` (QRIS/VA/tunai) + webhook HMAC idempoten. Late payment: re-reserve atomik → `paid` / `paid_after_expiry` + refund otomatis. |
| **Refund** | Manual soft launch: `queued` → admin catat penyelesaian lewat dashboard. |
| **Dashboard** | Order bulanan + widget total/pendapatan, CRUD menu (soft delete), detail order, aksi status 1 arah, pengaturan hari (kapasitas, cut-off, jendela antar, target, menu/tiap tgl), rekap produksi cetak, refund, audit log, quotation/PO manual. |
| **Storefront** | Beranda, cek area, menu per tgl + sisa porsi, keranjang terikat tgl, checkout, status order + countdown & simulasi bayar, "Pesanan" (lookup nomor+HP/sesi device), jalur quotation. |
| **Worker** | pg-boss: hold sweep, notifikasi outbox, penguncian rekap produksi, pembersihan. |
| **Anti-bot** | Rate limit DB (konsisten cross-instance), CAPTCHA HMAC, OTP adaptif (2 hold kedaluwarsa → OTP). |

**Masih mock/placeholder** (disengaja untuk thin slice): gateway pembayaran asli, pengiriman email/WhatsApp, CAPTCHA Turnstile, upload bukti serah terima kurir, PWA kurir, akun & loyalitas.

---

## 📦 Struktur Repo

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

## 🚀 Menjalankan

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

## 📋 Perintah Berguna

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

## 🎨 Design System

| Frontend | Sistem | Detail |
|----------|--------|--------|
| **Storefront (`apps/web`)** | Material 3 "Artisanal Culinary Commerce" | Warna cream/amber/sage, font **Plus Jakarta Sans** (self-hosted `@fontsource-variable` untuk CSP `font-src 'self'`), breakpoint M3 window size class. |
| **Dashboard (`apps/dashboard`)** | shadcn/ui port ke SolidJS via **Kobalte** | Tailwind v4, token neutral light-only. Komponen: Button, Badge, Card, Input, Select, Checkbox, Table, Dialog, AlertDialog, DropdownMenu, Sheet, Toast, dll. |

---

## 🐳 Deployment

| Environment | Compose | Env File | Database | Image |
|-------------|---------|----------|----------|-------|
| Development | `compose.dev.yml` | `.env.development` | Container (port 5433) | `catering/dev:local` (hot reload) |
| Staging | `compose.staging.yml` | `.env.staging` | Container (port 5434) | `catering/*:staging` (production-like) |
| Production | `compose.prod.yml` (+ `compose.prod.db.yml` opsional) | `.env.production` | **Terkelola/eksternal** (disarankan PITR) | `catering/*:${IMAGE_TAG}` (immutable) |

- **Satu image API** untuk `web` + `worker` (beda `ROLE`).
- Migrasi one-shot sebelum app (`depends_on`).
- Secret lewat env file (gitignore), **tidak** di image/repo.
- Production: reverse proxy TLS (Caddy/NGINX) di host, port container hanya loopback.

---

## 📊 Status Roadmap

| Fase | Status |
|------|--------|
| **0** — Keputusan bisnis & konfigurasi | Sebagian besar default di tabel `settings` |
| **1a** — Repo/CI/skema/kapasitas atomik | ✅ Selesai; tes 5k konkuren |
| **1b** — Alur tamu, menu, anti-bot dasar | ✅ Selesai |
| **1c** — Checkout, hold, webhook, job, notifikasi | ✅ Selesai (gateway/channel mock) |
| **1d** — Dashboard, rekap, audit, refund, load test, restore | Dashboard/rekap/audit/refund ✅; load test HTTP & restore manual |
| **2** — Kurir PWA, refund auto, ubah order, invoice, quotation/PO lengkap, multi-tgl | ⏳ Belum (tabel & endpoint dasar quotation/PO siap) |
| **3** — Akun & loyalitas, read replica, pecah aplikasi | ⏳ Belum |

---

## ⚠️ Menuju Production (Harus Diganti)

1. **Gateway asli** — implement `PaymentGateway` (Midtrans/Xendit), verifikasi signature.
2. **Notifikasi nyata** — sambung outbox ke SMTP/WhatsApp Business API di worker.
3. **CAPTCHA Turnstile** — `CAPTCHA_PROVIDER=turnstile` + `TURNSTILE_SECRET_KEY`.
4. **CSP di edge** — pindah ke Cloudflare dengan nonce + WAF rate limit per IP.
5. **Load test HTTP & uji restore** — skenario PRD §11 (≈280 rps CDN / 56 rps origin), catat RPO/RTO.
6. **Image & deploy** — compose terpisah staging/prod, build image tag versi, migrasi one-shot, naikkan versi.

---

## 📁 Dokumentasi Utama

| File | Isi |
|------|-----|
| `docs/README.md` | Indeks dokumen, overview, menjalankan, struktur, keputusan, env, checklist production |
| `docs/architecture.md` | Topologi, peta modul, invarian kapasitas, alur checkout, state machine, webhook, auth, deployment |
| `docs/api.md` | Semua endpoint publik+admin, contoh request/response, kode error |
| `docs/prd-mapping.md` | Pemetaan PRD §1–13 ke implementasi, status per fitur |
| `docs/docker.md` | Arsitektur container, dev/staging/prod, operasional, troubleshooting |
| `docs/design-web.md` | Design system M3 storefront (warna, tipografi, layout, komponen) |
| `docs/dashboard-ui.md` | Design system shadcn/ui dashboard (token, komponen, pola, aksesibilitas) |

---

## 🔐 Variabel Environment (Ringkas)

| Variabel | Wajib | Keterangan |
|----------|-------|------------|
| `DATABASE_URL` | ya | Koneksi PostgreSQL aplikasi |
| `DATABASE_URL_TEST` | tes | Database terpisah untuk tes integrasi |
| `SESSION_SECRET` | produksi | ≥ 32 byte; menandatangani token status & OTP |
| `CAPTCHA_SECRET` | produksi | HMAC tantangan CAPTCHA |
| `PAYMENT_GATEWAY` | tidak | `mock` (default) |
| `PAYMENT_WEBHOOK_SECRET` | produksi | Verifikasi signature webhook |
| `APP_URL` / `DASHBOARD_URL` | ya | Origin storefront & dashboard (CORS & tautan status) |
| `ROLE` | worker | `web` atau `worker` |

> Lihat `.env.example` dan `deploy/env/*.example` untuk daftar lengkap. **Jangan commit kredensial production.**

---

## 📝 Lisensi

Internal — Catering Talago. Tidak untuk distribusi.
