---
language: id-ID
---

# AGENTS.md — konteks proyek

Ringkasan mesin-baca ada di [`docs/quick-reference.md`](docs/quick-reference.md). Indeks seluruh dokumen: [`docs/README.md`](docs/README.md).

## Status
- Development dijeda; stack Docker (`docker compose -f deploy/compose.dev.yml`) dimatikan.
- Seluruh aplikasi dapat berjalan di Docker dengan compose terpisah dev/staging/prod; lihat
  [`docs/docker.md`](docs/docker.md).
- Dashboard memakai design system shadcn/ui light mode (Tailwind v4 + Kobalte); lihat
  [`docs/dashboard-ui.md`](docs/dashboard-ui.md).
- PostgreSQL 16 native tetap berjalan di `127.0.0.1:5432`. Container dev memakai port host `5433`.
- Semua tes/build/lint terakhir hijau: 18 unit + 26 integrasi.

## Stack & perintah
- Monorepo Turborepo + pnpm. `apps/api` (Hono), `apps/web` (Astro+Solid), `apps/dashboard`
  (TanStack Start+Solid), `packages/core` (domain/Drizzle), `packages/contracts`.
- Menyalakan (Docker): `pnpm docker:dev:up` lalu `pnpm docker:dev:seed`.
- Menyalakan (native): `pnpm dev:api`, `pnpm dev:web`, `pnpm dev:dashboard`, `pnpm dev:worker`.
- Verifikasi: `pnpm lint`, `pnpm typecheck`, `pnpm build`, `pnpm test`,
  `pnpm test:integration`.
- Migrasi: `pnpm db:migrate`; reset+seed dev: `pnpm db:reset`.

## Aturan kerja
- Jangan menulis tabel milik modul lain; impor lintas modul lewat `../<modul>/index`.
- Setiap perubahan skema wajib `pnpm db:generate` + migrasi; jangan edit SQL migrasi lama.
- Batas porsi per order default 200 (setting `order.max_portions_per_order`), minimal 50;
  target minimum produksi terpisah dan tidak membatasi checkout.
- Menu dihapus soft delete; order lama memakai snapshot.
- Jangan commit kredensial production; `.env` lokal sudah di-gitignore.
