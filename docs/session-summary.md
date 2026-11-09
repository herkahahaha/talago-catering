# Session Summary — Platform Catering Online

> **Status sesi:** development dijeda. Semua server aplikasi sudah dimatikan.
> PostgreSQL tetap berjalan (sengaja) agar koneksi DBeaver tetap hidup.
> Terakhir diperbarui: 3 November 2026.

## 1. Lokasi & status repo

- Workspace: `/Users/herkafitra/Documents/deepseek-harness/default-workspace`
- Git: sudah `git init`, **belum ada commit** — seluruh isi masih untracked.
- Build, lint, typecheck, dan tes terakhir: **hijau**.
- Server aplikasi: **mati** (port 3000, 3001, 4321 tertutup).
- PostgreSQL 16 (Homebrew): **hidup** di `127.0.0.1:5432`.
- DBeaver: dua koneksi sudah ditambahkan dan dikonfigurasi.

## 2. Stack & struktur

Monorepo Turborepo + pnpm:

| Path | Isi |
| :-- | :-- |
| `apps/api` | Hono (Node), rute publik + admin, worker pg-boss |
| `apps/web` | Astro 7 SSR + SolidJS islands (storefront) |
| `apps/dashboard` | TanStack Start + SolidJS (admin/dapur/kurir) |
| `packages/core` | Domain + Drizzle + SQL atomik |
| `packages/contracts` | Zod, DTO, enum, label bersama |
| `deploy/` | Dockerfile api/web/dashboard/migrate/dev + compose dev/staging/prod + env |
| `docs/` | architecture, runbook, API, pemetaan PRD, screenshot |

Aturan modul ditegakkan `scripts/check-boundaries.mjs` (dipanggil `pnpm lint`).

## 3. Fitur yang sudah selesai

- Kapasitas atomik per tanggal (lazy expiry, hold ceiling, cut-off, partisi PO).
- Checkout tamu: sesi cookie, CAPTCHA, Idempotency-Key, rate limit database, hold 10 menit.
- Pembayaran mock QRIS/VA/tunai + webhook HMAC idempoten, termasuk pembayaran telat
  (`paid` / `paid_after_expiry` + refund queued).
- Refund manual soft launch, audit log, rekap produksi siap cetak.
- Dashboard:
  - daftar order **satu bulan penuh** + widget total pesanan, pendapatan, nilai seluruh order,
    total porsi;
  - CRUD menu (tambah/edit/nonaktifkan, auto-jadwal 14 hari, gambar opsional);
  - pengaturan hari memakai **date picker** (default hari ini) + **Terapkan ke minggu ini**
    (Senin–Minggu, satu transaksi);
  - aturan checkout global: min porsi, **maks porsi per order**, durasi hold;
  - detail order, status, refund, audit, penawaran, order manual/PO.
- Storefront:
  - beranda, cek area, menu per tanggal, keranjang satu tanggal, checkout, status order;
  - input porsi bisa diketik langsung;
  - halaman **Pesanan** (`/pesanan`) untuk lacak via sesi perangkat atau nomor order + nomor HP
    (token tampilan bertanda tangan 30 menit);
  - quotation untuk pesanan di atas batas order.
- Worker: `hold-sweep`, `notifications`, `production-lock`, `cleanup` (pg-boss).

## 4. Keputusan penting (termasuk deviasi PRD)

- **Batas porsi per order sekarang default 200** (PRD awal: cap 50). Dapat diubah admin di
  Pengaturan hari → Aturan checkout. Minimal tetap 50.
- **Target minimum produksi ≠ batas per order.** Target hanya indikator dapur; tidak membatasi
  checkout. Batas per order diatur terpisah.
- Saat batas per order dinaikkan, `ensureMinimumHoldCeiling` menaikkan plafon hold hari-hari ke
  depan minimal sebesar batas tersebut (dibatasi `max_regular`).
- Terapkan mingguan: kapasitas, cut-off (bergeser per tanggal), jendela antar, target minimum.
  Menu per tanggal tidak ikut berubah.
- Menu dihapus secara **soft delete** (`is_active = false`) agar snapshot order lama aman.
- Revenue pada overview = order lunas/diproses; `grossOrderValue` = seluruh order.
- Token halaman Pesanan berumur 30 menit; tautan status permanen lama tetap berlaku.

## 5. Data lokal saat ini

| Item | Nilai |
| :-- | :-- |
| Database dev | `catering_dev` |
| Database test | `catering_test` |
| Host / port | `127.0.0.1:5432` |
| User / password | `catering` / `catering_dev_pw` |
| Tabel | 25 tabel di schema `public` |
| Menu | 9 item (termasuk Tahu Goreng Spesial) |
| Order | 7 order (seed + uji E2E; satu uji 200 porsi dibatalkan) |
| Nov 10 | 0/200 porsi, hold ceiling 200 (siap dites order 200) |
| Setting order | min 50, max 200, hold 10 menit |

DBeaver (sudah dikonfigurasi):

- `Catering Dev (localhost)` → `catering_dev`
- `Catering Test (localhost)` → `catering_test`
- Config: `~/Library/DBeaverData/workspace6/General/.dbeaver/data-sources.json`
  (backup `data-sources.json.bak-*` tersedia).

## 6. Menyalakan kembali

```bash
cd /Users/herkafitra/Documents/deepseek-harness/default-workspace
brew services list | grep postgresql   # pastikan postgresql@16 started

pnpm dev:api        # http://127.0.0.1:3000
pnpm dev:web        # http://127.0.0.1:4321
pnpm dev:dashboard  # http://127.0.0.1:3001
pnpm dev:worker     # worker pg-boss
# atau semua app: pnpm dev
```

Akun demo:

| Peran | Email | Password |
| :-- | :-- | :-- |
| Admin | `admin@catering.local` | `admin12345` |
| Dapur | `dapur@catering.local` | `dapur12345` |
| Kurir | `kurir@catering.local` | `kurir12345` |

## 7. Mematikan

```bash
pkill -f "tsx src/index.ts"
pkill -f "astro dev"
pkill -f "vite dev --port 3001"
# opsional, jika ingin mematikan database juga:
# brew services stop postgresql@16
```

## 8. Perintah verifikasi

```bash
pnpm lint          # ESLint + batas modul (14 modul)
pnpm typecheck     # 5 workspace
pnpm build         # API + storefront + dashboard
pnpm test          # 18 tes unit
pnpm test:integration  # 26 tes integrasi (DB catering_test)
```

Hasil terakhir: **18 unit + 26 integrasi lulus**, build/lint/typecheck lulus.
Tes konkurensi: 5.000 percobaan → tepat 4 order 50 porsi pada kapasitas 200, tidak pernah
melewati `max_regular`.

## 9. Yang belum / langkah berikutnya

1. Gateway pembayaran asli (Midtrans/Xendit) — `PaymentGateway` + verifikasi signature sesuai
   dokumentasi gateway.
2. Notifikasi nyata (SMTP/WhatsApp Business API) — outbox worker masih mock.
3. Image Docker sudah di-build & diuji (dev/staging/production). Yang belum: pipeline CI untuk
   build/push image ke registry dan otomasi deploy ke server.
4. Load test HTTP (`scripts/load-checkout.js`), uji restore/PITR, uji injeksi & otorisasi formal.
5. CSP nonce di Cloudflare/WAF, rate limit IP di edge.
6. Fase 2: kurir PWA, refund otomatis, ubah order, invoice, multi-tanggal; fase 3: akun/loyalitas.
7. Commit awal repo (belum ada commit) sebelum handoff ke tim.

## 10. File kunci

- [README](../README.md)
- [Arsitektur](architecture.md)
- [API](api.md)
- [PRD mapping](prd-mapping.md)
- [Runbook](runbook.md)
- [Docker dev/staging/production](docker.md)
- [Design system dashboard](dashboard-ui.md)
- Kapasitas: [reserve.ts](../packages/core/src/modules/capacity/reserve.ts)
- Checkout/webhook: [checkout/service.ts](../packages/core/src/modules/checkout/service.ts)
- Pengaturan hari: [days.$date.tsx](../apps/dashboard/src/routes/days.$date.tsx)
- Menu CRUD: [catalog/service.ts](../packages/core/src/modules/catalog/service.ts)
- Pesanan storefront: [pesanan/index.astro](../apps/web/src/pages/pesanan/index.astro)
- Tes: [tests/integration](../packages/core/tests/integration)
