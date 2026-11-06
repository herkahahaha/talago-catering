# Dokumentasi Proyek

Dokumentasi teknis untuk dua perubahan besar terakhir:

1. **Dashboard memakai design system shadcn/ui (light mode)** — tanpa mengubah alur bisnis.
2. **Seluruh aplikasi berjalan di Docker** dengan konfigurasi terpisah untuk development,
   staging, dan production.

## Daftar dokumen

| Dokumen | Isi |
| :-- | :-- |
| [dashboard-ui.md](dashboard-ui.md) | Design system, token, inventaris komponen, pola pemakaian, screenshot, dan batasan |
| [docker.md](docker.md) | Arsitektur container, cara menjalankan tiap environment, deploy production, operasional, troubleshooting |

## Ringkasan cepat

```bash
# Development (hot reload, semua service di Docker)
cp deploy/env/.env.development.example deploy/env/.env.development
docker compose -f deploy/compose.dev.yml up --build
docker compose -f deploy/compose.dev.yml run --rm seed

# Dashboard  http://127.0.0.1:3001  (admin@catering.local / admin12345)
# Storefront http://127.0.0.1:4321
# API        http://127.0.0.1:3000/health
```

Dokumentasi lain yang sudah ada sejak awal berada di [`../docs/`](../docs/): arsitektur domain,
API, runbook operasional, dan pemetaan PRD.
