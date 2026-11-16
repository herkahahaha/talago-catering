---
language: id-ID
---

# AGENTS.md

Berkas ini disertakan dalam konteks lengkap untuk setiap percakapan agen. Tetap kecil dan stabil.

## Aturan kerja
- Jangan menulis tabel milik modul lain; impor lintas modul lewat `../<modul>/index`.
- Setiap perubahan skema wajib `pnpm db:generate` + migrasi; jangan edit SQL migrasi lama.
- Batas porsi per order default 200 (setting `order.max_portions_per_order`), minimal 50;
  target minimum produksi terpisah dan tidak membatasi checkout.
- Menu dihapus soft delete; order lama memakai snapshot.
- Jangan commit kredensial production; `.env` lokal sudah di-gitignore.

## Agent docs (source of truth)

- [`docs/architecture.md`](docs/architecture.md) Topologi, peta modul, invarian kapasitas, alur checkout, state machine, webhook, auth, deployment
- [`docs/api.md`](docs/api.md) Semua endpoint publik+admin, contoh request/response, kode error
- [`docs/prd-mapping.md`](docs/prd-mapping.md) Pemetaan PRD §1–13 ke implementasi, status per fitur
- [`docs/docker.md`](docs/docker.md) Arsitektur container, dev/staging/prod, operasional, troubleshooting
- [`docs/design-web.md`](docs/design-web.md) Design system M3 storefront (warna, tipografi, layout, komponen)
- [`docs/dashboard-ui.md`](docs/dashboard-ui.md) Design system shadcn/ui dashboard (token, komponen, pola, aksesibilitas)
