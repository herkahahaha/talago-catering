# Menjalankan Platform di Docker

Dokumen ini menjelaskan containerisasi seluruh aplikasi (API, worker, storefront, dashboard,
database, dan migrasi) dengan konfigurasi terpisah untuk **development**, **staging**, dan
**production**.

Status verifikasi (dijalankan di mesin pengembangan):

- Docker Engine 29.2.1 + Docker Compose v5.6.1 (Docker Desktop, macOS arm64).
- Dev stack: `db`, `migrate`, `api`, `worker`, `web`, `dashboard` naik dan sehat; seed berjalan.
- Staging: image production di-build, migrasi + seed berjalan, dashboard dapat login dan CSS termuat.
- Production: compose + overlay database self-hosted dijalankan, migrasi, login dashboard, health
  check API, dan worker `worker siap`.

---

## 1. Prinsip

1. **Semua aplikasi berjalan di container.** Host hanya butuh Docker + `git`; Node/pnpm/PostgreSQL
   lokal tidak diperlukan (opsional untuk tooling).
2. **Satu Dockerfile per aplikasi**, dengan multi-stage build dan image runtime non-root.
3. **Environment terpisah** — image diberi tag berbeda, env file berbeda, dan perilaku berbeda
   (dev: hot reload + seed; staging: mirip production + seed opsional; production: image immutable,
   tanpa seed).
4. **Migrasi selalu one-shot sebelum aplikasi baru**, tidak dijalankan di dalam entrypoint API.
5. **Secret tidak masuk image maupun repo.** Semua lewat env file yang di-gitignore.
6. **Port hanya di-bind ke `127.0.0.1`** (kecuali dev yang memang untuk browser lokal); TLS dan
   domain ditangani reverse proxy.

---

## 2. Arsitektur container

```text
                         ┌───────────── reverse proxy (TLS) ─────────────┐
                         │  example.id → web:4321                        │
                         │  dashboard.example.id → dashboard:3001        │
                         │  api.example.id → api:3000                    │
                         └───────────────┬───────────────────────────────┘
                                         │ network internal
   ┌──────────────┐      ┌───────────────┴──────┐      ┌──────────────────┐
   │   web        │      │        api           │      │   worker         │
   │ Astro SSR    │─────▶│ Hono (ROLE=web)      │◀─────│ ROLE=worker      │
   │ :4321        │      │ :3000                │      │ pg-boss          │
   └──────────────┘      └───────┬──────────────┘      └────────┬─────────┘
                                 │                              │
                                 ▼                              ▼
                          ┌──────────────────────────────────────────┐
                          │ PostgreSQL 16 (dev/staging: container,    │
                          │ production: terkelola / overlay db)       │
                          └──────────────────────────────────────────┘
   ┌──────────────┐
   │  dashboard   │  TanStack Start + SolidJS (Nitro) :3001
   └──────────────┘
```

| Service | Image | Peran | Port internal |
| :-- | :-- | :-- | :-- |
| `db` | `postgres:16-alpine` | Database (dev & staging; production opsional) | 5432 |
| `migrate` | `catering/migrate` | One-shot `pnpm db:migrate` | — |
| `seed` | `catering/migrate` | One-shot `pnpm db:seed` (profil `seed`) | — |
| `api` | `catering/api` | HTTP API (`ROLE=web`) | 3000 |
| `worker` | `catering/api` (image sama) | Job pg-boss (`ROLE=worker`) | — |
| `web` | `catering/web` | Storefront Astro SSR | 4321 |
| `dashboard` | `catering/dashboard` | Dashboard admin (Nitro) | 3001 |

`api` dan `worker` sengaja memakai image yang sama; perbedaan hanya pada env `ROLE`.

---

## 3. Matriks environment

| | Development | Staging | Production |
| :-- | :-- | :-- | :-- |
| Compose | `deploy/compose.dev.yml` | `deploy/compose.staging.yml` | `deploy/compose.prod.yml` (+ `compose.prod.db.yml` bila self-hosted) |
| Env file | `deploy/env/.env.development` | `deploy/env/.env.staging` | `deploy/env/.env.production` |
| Image | `catering/dev:local` (satu image, semua service) | `catering/{api,web,dashboard,migrate}:staging` | `catering/...:${IMAGE_TAG}` (immutable) |
| Database | Container + volume, host port **5433** | Container + volume, host port **5434** | **Eksternal/terkelola** (atau overlay `db`) |
| `NODE_ENV` | `development` | `production` | `production` |
| Hot reload | Ya (bind mount `src/`) | Tidak | Tidak |
| Seed | `run --rm seed` | Profil `--profile seed` | Tidak tersedia |
| Migrasi | Otomatis saat `up` | Otomatis saat `up` | One-shot service sebelum app |
| Port host | 3000 / 3001 / 4321 | 3000 / 3001 / 4321 (dapat diubah) | 3000 / 3001 / 4321 (loopback, di belakang proxy) |

Perbedaan penting:

- **Dev** tidak memakai image production; `Dockerfile.dev` berisi seluruh dependency + source dan
  source di-bind-mount agar hot reload.
- **Staging/production** memakai `Dockerfile.api`, `Dockerfile.web`, `Dockerfile.dashboard`,
  `Dockerfile.migrate` (multi-stage, non-root, hanya dependency produksi).
- `PUBLIC_API_URL` (web) dan `VITE_API_URL` (dashboard) **di-inline saat build**, jadi staging dan
  production wajib di-build dengan URL environment masing-masing. **Development sebaliknya
  mengosongkan keduanya**: browser memakai proxy `/api` se-origin (`astro.config.mjs` /
  `vite.config.ts` → `API_BASE_URL`), sehingga cookie sesi/staf (httpOnly, `SameSite=Lax`) selalu
  first-party baik dibuka via `localhost` maupun `127.0.0.1`.

---

## 4. Prasyarat

- Docker Desktop / Docker Engine **24+** dengan Compose v2/v5.
- RAM minimal 4 GB untuk Docker (disarankan 8 GB bila build semua image sekaligus).
- Port host yang dipakai: `3000`, `3001`, `4321`, `5433` (dev), `5434` (staging).
- Git checkout repo ini.

Cek cepat:

```bash
docker version
docker compose version
docker info --format '{{.ServerVersion}} {{.OperatingSystem}}'
```

---

## 5. Persiapan

```bash
# Development
cp deploy/env/.env.development.example deploy/env/.env.development

# Staging / production (isi CHANGE_ME dengan secret asli)
cp deploy/env/.env.staging.example deploy/env/.env.staging
cp deploy/env/.env.production.example deploy/env/.env.production

# Buat secret kuat
openssl rand -base64 48   # SESSION_SECRET
openssl rand -base64 32   # CAPTCHA_SECRET
```

File `deploy/env/.env.*` **tidak di-commit** (lihat `.gitignore`); hanya `*.example` yang masuk repo.
Jangan pernah menaruh kredensial production di image atau di compose file.

---

## 6. Development

### 6.1 Menyalakan

```bash
docker compose -f deploy/compose.dev.yml up --build
```

Urutan otomatis:

1. `db` naik dan sehat (`pg_isready`).
2. `migrate` menjalankan migrasi lalu keluar dengan kode 0.
3. `api`, `worker`, `web`, `dashboard` mulai setelah migrasi sukses.

Akses:

| Layanan | URL |
| :-- | :-- |
| Dashboard | <http://127.0.0.1:3001> |
| Storefront | <http://127.0.0.1:4321> |
| API | <http://127.0.0.1:3000/health> |
| PostgreSQL | `127.0.0.1:5433` (user `catering`, db `catering_dev`) |

Akun demo: `admin@catering.local / admin12345`, `dapur@catering.local / dapur12345`,
`kurir@catering.local / kurir12345`.

### 6.2 Seed data contoh

```bash
docker compose --profile seed -f deploy/compose.dev.yml run --rm seed
```

Flag `--profile seed` wajib: service `seed` tidak terdaftar tanpa profil itu (`config --services`
tidak menampilkannya), sehingga perintah tanpa flag gagal dengan "no such service".
Aman diulang: seed melewati pembuatan order bila sudah ada.

### 6.3 Log, status, dan shell

```bash
docker compose -f deploy/compose.dev.yml ps
docker compose -f deploy/compose.dev.yml logs -f api
docker compose -f deploy/compose.dev.yml logs -f worker dashboard
docker compose -f deploy/compose.dev.yml exec api sh
docker compose -f deploy/compose.dev.yml exec db psql -U catering -d catering_dev
```

### 6.4 Hot reload

Yang di-bind-mount hanya direktori source:

```text
apps/api/src            apps/web/src
apps/dashboard/src      packages/core/src
packages/contracts/src
```

Perubahan file langsung memicu reload (Vite HMR untuk dashboard/web, `tsx watch` untuk API/worker).

Yang **tidak** ikut ter-mount: `package.json`, `pnpm-lock.yaml`, config Vite/Astro, dan file di akar
repo. Bila mengubah dependensi atau konfigurasi build:

```bash
docker compose -f deploy/compose.dev.yml up --build -d
```

### 6.5 Reset database

```bash
# Hentikan dan hapus volume database (data hilang)
docker compose -f deploy/compose.dev.yml down -v
docker compose -f deploy/compose.dev.yml up -d
docker compose --profile seed -f deploy/compose.dev.yml run --rm seed
```

### 6.6 Menjalankan tes di container

```bash
# Lint + typecheck seluruh monorepo di image dev
docker compose -f deploy/compose.dev.yml run --rm --no-deps api pnpm lint
docker compose -f deploy/compose.dev.yml run --rm --no-deps api pnpm typecheck

# Tes integrasi memakai database terpisah di service db
docker compose -f deploy/compose.dev.yml run --rm api pnpm test:integration
```

> Tes integrasi mereset schema `DATABASE_URL_TEST`; jangan arahkan ke database berisi data penting.

### 6.7 (OPTIONAL) Catatan port database

PostgreSQL native (bila ada) memakai `5432`, karena itu container dev dipetakan ke **5433**. Dari
host gunakan `DATABASE_URL_HOST` yang sudah disediakan di env development:

```bash
psql 'postgres://catering:catering_dev_pw@127.0.0.1:5433/catering_dev'
```

Di dalam container, hostname database adalah `db:5432`.

---

## 7. Staging

Staging adalah replika production: image production, database container, seed opsional, dan port
loopback.

```bash
# Build + jalankan
docker compose --env-file deploy/env/.env.staging \
  -f deploy/compose.staging.yml up -d --build

# Status & kesehatan
docker compose --env-file deploy/env/.env.staging -f deploy/compose.staging.yml ps

# Seed (opsional, hanya staging; tanpa `--profile seed` gagal `no such service`
# karena service memakai `profiles: ['seed']`, pola yang sama seperti §6.2)
# atau: pnpm docker:staging:seed
docker compose --env-file deploy/env/.env.staging \
  --profile seed -f deploy/compose.staging.yml run --rm seed

# Log
docker compose --env-file deploy/env/.env.staging \
  -f deploy/compose.staging.yml logs -f api worker dashboard
```

Default akses staging: dashboard `:3001`, storefront `:4321`, API `:3000`, PostgreSQL `:5434`.
Ubah lewat `API_PORT`, `WEB_PORT`, `DASHBOARD_PORT`, `DB_PORT` di env staging.

Catatan penting:

- Buka dashboard, storefront, dan API lewat **hostname yang sama** dengan yang di-bake di
  `PUBLIC_API_URL` (default semua `127.0.0.1` — jangan campur `localhost` dan `127.0.0.1`).
  Host browser yang berbeda dari `PUBLIC_API_URL` dihitung lintas-site sehingga cookie
  `SameSite=Lax` tidak dikirim kembali.
- `PUBLIC_API_URL` dan `APP_URL`/`DASHBOARD_URL` harus sesuai URL yang dipakai browser.
- Bila ingin hostname/domain lain, ubah `PUBLIC_API_URL`, `APP_URL`, `DASHBOARD_URL` di
  `deploy/env/.env.staging` lalu **build ulang** `web` + `dashboard` (nilai di-inline saat
  build; tanpa rebuild browser tetap menembak URL lama).
- Jika domain publik dipakai, ganti `PUBLIC_API_URL`, `APP_URL`, `DASHBOARD_URL` ke domain staging
  lalu **build ulang** `web` dan `dashboard` (nilainya di-inline saat build).
- Hentikan stack dev dulu (`pnpm docker:dev:down`) atau override `API_PORT`/`WEB_PORT`/
  `DASHBOARD_PORT` bila kedua stack jalan bersamaan — default port staging sengaja sama dengan
  dev agar bookmark/skrip konsisten.
- Akses staging polos-http hanya via loopback (`127.0.0.1`/`localhost`); akses via IP
  LAN/hostname non-loopback membutuhkan reverse proxy TLS, kalau tidak cookie `Secure` tidak
  terkirim dan login/checkout gagal.

Hentikan:

```bash
docker compose --env-file deploy/env/.env.staging -f deploy/compose.staging.yml down
# tambahkan -v bila ingin menghapus volume database staging
```

---

## 8. Production

### 8.1 Pilihan database

**Disarankan: database terkelola** (PostgreSQL 16 dengan PITR/backup otomatis). Isi `DATABASE_URL`
di `deploy/env/.env.production` dan jalankan compose tanpa service `db`:

```bash
docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml up -d
```

**Alternatif: Postgres self-hosted** di host yang sama tanpa PITR, gunakan overlay:

```bash
# DATABASE_URL harus memakai host `db`
docker compose --env-file deploy/env/.env.production \
  -f deploy/compose.prod.yml -f deploy/compose.prod.db.yml up -d
```

Port database tidak dipublikasikan; akses hanya dari jaringan compose.

### 8.2 Build dan push image di CI

```bash
TAG=2026.11.05
REG=registry.example.id/catering
PUBLIC_API_URL=https://api.example.id

docker build -f deploy/Dockerfile.api        -t $REG/api:$TAG .
docker build -f deploy/Dockerfile.migrate    -t $REG/migrate:$TAG .
docker build -f deploy/Dockerfile.web        --build-arg PUBLIC_API_URL=$PUBLIC_API_URL -t $REG/web:$TAG .
docker build -f deploy/Dockerfile.dashboard  --build-arg VITE_API_URL=$PUBLIC_API_URL -t $REG/dashboard:$TAG .

docker push $REG/api:$TAG
docker push $REG/migrate:$TAG
docker push $REG/web:$TAG
docker push $REG/dashboard:$TAG
```

Set `IMAGE_PREFIX=registry.example.id/catering` dan `IMAGE_TAG=$TAG` di env production agar compose
memakai image yang benar. Di server cukup `pull` (tanpa `--build`):

```bash
pnpm docker:prod:pull
pnpm docker:prod:up
# alternatif mentah:
# docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml pull
# docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml up -d
```

### 8.3 Urutan rilis

`depends_on` di compose menegakkan urutan:

1. `migrate` (one-shot) — harus exit 0.
2. `api` dan `worker` — start setelah migrasi.
3. `web` dan `dashboard` — start setelah migrasi.

Rollback aplikasi: jalankan ulang dengan `IMAGE_TAG` versi sebelumnya. Migrasi dirancang
**additive** (expand/contract), sehingga rollback satu versi tidak memerlukan rollback skema.
Jangan pernah mengedit SQL migrasi lama.

### 8.4 Reverse proxy & TLS

Compose hanya membuka port di loopback. Contoh Caddy di host:

```caddyfile
example.id {
  reverse_proxy 127.0.0.1:4321
}

dashboard.example.id {
  reverse_proxy 127.0.0.1:3001
}

api.example.id {
  reverse_proxy 127.0.0.1:3000
}
```

Sesuaikan `APP_URL`, `DASHBOARD_URL`, dan `PUBLIC_API_URL` dengan domain di atas. API hanya
mengizinkan origin `APP_URL` dan `DASHBOARD_URL` (CORS), jadi ketiganya harus konsisten.
Buka ketiganya lewat domain tersebut di browser, bukan nilai contoh `example.id` yang belum
diganti. Cookie sesi memakai `SameSite=Lax`; karena semua subdomain berada di site yang sama
(`example.id`), cookie tetap terkirim. Wajib HTTPS di production.

### 8.5 Backup & restore

```bash
# Backup (self-hosted)
docker compose --env-file deploy/env/.env.production \
  -f deploy/compose.prod.yml -f deploy/compose.prod.db.yml \
  exec -T db pg_dump -U catering -d catering -Fc > backup-$(date +%F).dump

# Restore
cat backup-2026-11-05.dump | docker compose ... exec -T db \
  pg_restore -U catering -d catering --clean --if-exists
```

Untuk database terkelola, gunakan snapshot/PITR dari penyedia. Uji restore secara berkala.

### 8.6 Secret & konfigurasi

| Variabel | Wajib | Catatan |
| :-- | :-- | :-- |
| `DATABASE_URL` | ya | Gunakan `sslmode=require` untuk database terkelola |
| `SESSION_SECRET` | ya | ≥ 16 karakter; semua tautan status lama & OTP batal; sesi tamu tetap valid (hash token disimpan) |
| `CAPTCHA_SECRET` | ya | ≥ 16 karakter |
| `PAYMENT_WEBHOOK_SECRET` | ya | Harus sama dengan yang di gateway |
| `PUBLIC_API_URL` | ya | Build arg web + dashboard |
| `APP_URL`, `DASHBOARD_URL` | ya | CORS API |
| `PAYMENT_GATEWAY` | ya | `mock` hanya untuk non-production |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | seed | Perintah CLI sekali jalan |

- Contoh `CLI sekali jalan`; `docker compose … run --rm migrate pnpm admin:create --email … --role admin`, password diminta lewat prompt namun dengan 3 aturan; 1. Menolak berjalan bila sudah ada admin, kecuali memakai flag eksplisit. 2. Menulis audit_log (aktor cli) dan tidak mencetak password. 3. Perintah yang sama dipakai untuk reset password dan membuat peran kitchen/courier, serta menghapus staff_sessions pengguna itu. Runbook §8 saat ini mencatat sesi aktif tidak batal otomatis saat password diubah.
- Gunakan `INSERT manual` ke DB pembuatan `ADMIN_EMAIL`, `ADMIN_PASSWORD` sebagai prosedur darurat saja, dengan syarat dicatat manual di audit_log. Dengan `CLI sekali jalan`, tidak perlu menyimpan password admin di env production.
- `ROLE` di-override oleh compose (`web` untuk api, `worker` untuk worker).

---

## 9. Optimasi image

| Optimasi | Detail |
| :-- | :-- |
| Multi-stage | Stage `deps` → `build` → `prod-deps` → `runtime`; source build tidak masuk image akhir |
| Dependency produksi saja | Runtime menjalankan `pnpm install --frozen-lockfile --prod`; devDeps hanya di stage build |
| Non-root | `USER node` di semua image produksi |
| Healthcheck | HTTP healthcheck di image API/web/dashboard; worker mematikan healthcheck karena tidak membuka port |
| Layer caching | Manifest workspace disalin lebih dulu, source belakangan |
| `.dockerignore` | `node_modules`, artefak build, env, docs, dan file lokal tidak masuk konteks |
| Bundle workspace | `@catering/*` dibundel ke `dist` (tsup `noExternal`), sehingga runtime tidak butuh source TS |
| Satu image API | Web dan worker berbagi image — hemat storage dan waktu build |
| Log rotation | `json-file` max 10 MB × 3 file per service |
| Graceful shutdown | `init: true` + `stop_grace_period: 30s` untuk API/worker |

Ukuran image hasil build (Docker Desktop, arm64):

| Image | Ukuran |
| :-- | :-- |
| `catering/api` | ±338 MB |
| `catering/dashboard` | ±290 MB |
| `catering/web` | ±515 MB |
| `catering/migrate` | ±599 MB |
| `catering/dev` (khusus dev) | ±969 MB |

Catatan: image `web`/`migrate` relatif besar karena runtime menyertakan dependency produksi dan
tooling migrasi (`tsx`, `drizzle`). Ini masih wajar untuk satu host; bila perlu, `migrate` dapat
dipindah ke job CI sekali jalan.

---

## 10. Operasional

```bash
# Status semua service
docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml ps

# Kesehatan API
curl -fsS http://127.0.0.1:3000/health

# Log real-time
docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml logs -f api worker

# Restart satu service tanpa mengubah image
docker compose ... restart dashboard

# Hentikan tanpa menghapus volume
docker compose ... down

# Hapus volume database (DESTRUKTIF)
docker compose ... down -v
```

Health check yang tersedia:

| Service | Pemeriksaan |
| :-- | :-- |
| `db` | `pg_isready -U <user> -d <db>` |
| `api` | `GET /health` |
| `web` | `GET /` |
| `dashboard` | `GET /login` |
| `worker` | Dinonaktifkan; pantau log `worker siap` dan tabel `pgboss` |

---

## 11. Troubleshooting

| Gejala | Penyebab | Solusi |
| :-- | :-- | :-- |
| `dashboard` mendengarkan port 3000 | Env `PORT=3000` dari env file ikut dibaca Vite/Nitro | Compose sudah meng-override `PORT=3001` untuk service dashboard; jangan hapus override itu |
| API crash `ERR_MODULE_NOT_FOUND: @catering/core` | `tsup` mengeksternalkan workspace, tetapi runtime tidak punya source TS | `tsup.config.ts` memakai `noExternal: [/^@catering\//]` agar workspace dibundel |
| API crash `Cannot find package 'pg'` | `pg` bukan dependency langsung `apps/api` | Sudah ditambahkan ke `apps/api/package.json` |
| Seed staging gagal `FORBIDDEN` | `settleMockPayment` diblokir saat `NODE_ENV=production` | Container `seed` memakai `NODE_ENV=development`; jangan ubah aplikasi menjadi development |
| Migrasi `ENOTFOUND db-host` | Env yang dipakai compose bukan env yang di-`--env-file` | Service membaca `env/.env.<environment>`; pastikan file itu yang diisi, dan `--env-file` menunjuk file yang sama |
| Migrasi `password authentication failed` | Volume database dibuat dengan password lama | Hapus volume (`down -v`) di dev/staging, atau samakan `POSTGRES_PASSWORD` dengan `DATABASE_URL` |
| Port 5432 bentrok dengan Postgres native | Dev memetakan database ke 5433 | Biarkan `DB_PORT=5433`; ubah bila perlu |
| Dashboard produksi tanpa CSS | `app.css?url` menghasilkan hash asset berbeda antara build SSR dan client | Gunakan side-effect import `import '~/styles/app.css'` di `__routes/__root.tsx` (sudah diterapkan) |
| Worker `unhealthy` | Image API membawa healthcheck HTTP untuk peran web | Compose worker memakai `healthcheck.disable: true` |
| HMR tidak bereaksi | File yang diubah tidak termasuk bind mount | Edit file di `src/` atau rebuild image dev |
| `run --rm seed` gagal "no such service" | Service `seed` memakai `profiles: ['seed']`, tanpa flag profil ia tidak terdaftar | Jalankan dengan flag profil: `docker compose --profile seed -f deploy/compose.dev.yml run --rm seed` (atau `pnpm docker:dev:seed`) |
| Checkout gagal "Sesi tamu tidak ditemukan" | Cookie `cg_session` (`SameSite=Lax`) diset lintas-site (`localhost` ↔ `127.0.0.1` dihitung beda site) lalu tidak dikirim kembali | Dev sudah memakai proxy `/api` se-origin — pastikan `PUBLIC_API_URL` kosong (default compose dev). Jangan menembak API absolut lintas-host dari browser |
| Checkout staging/production "Sesi tamu tidak ditemukan" | Host browser ≠ host `PUBLIC_API_URL` (lintas-site, cookie Lax tidak dikirim; di production juga cek `APP_URL`/`DASHBOARD_URL` vs domain yang dibuka) | Samakan host, atau rebuild dengan URL baru |
| Dashboard kosong setelah seed / login berputar ke `/login` | (a) seed belum pernah jalan; (b) cookie staf lintas-site seperti di atas; (c) tanggal demo (besok → +14 hari) jatuh di bulan berbeda dari filter | (a) jalankan seed profil; (b) `VITE_API_URL` kosongkan (default compose dev); (c) ganti filter bulan di halaman Pesanan |
| Login dashboard staging/production berputar ke /login | Host browser ≠ host `PUBLIC_API_URL` (lintas-site, cookie Lax tidak dikirim; di production juga cek `APP_URL`/`DASHBOARD_URL` vs domain yang dibuka) | Samakan host, atau rebuild dengan URL baru |
| `docker compose` error env file tidak ditemukan | Belum menyalin file example | `cp deploy/env/.env.<env>.example deploy/env/.env.<env>` |

Validasi konfigurasi tanpa menyalakan service:

```bash
docker compose -f deploy/compose.dev.yml config >/dev/null
docker compose --env-file deploy/env/.env.staging -f deploy/compose.staging.yml config >/dev/null
docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml config >/dev/null
```

---

## 12. Checklist rilis

- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm test:integration` hijau di CI.
- [ ] Image API, migrate, web, dashboard di-build dengan tag versi yang sama.
- [ ] `PUBLIC_API_URL`/`VITE_API_URL` sesuai domain environment (build ulang bila berubah).
- [ ] Secret production diisi dari secret manager (bukan example).
- [ ] Database production punya backup/PITR dan sudah diuji restore.
- [ ] Reverse proxy + TLS aktif; port container hanya loopback.
- [ ] `migrate` exit 0 sebelum API baru dibuat.
- [ ] `/health` API `{status:"ok",db:"ok"}`; worker log `worker siap`.
- [ ] Login dashboard, daftar pesanan, rekap produksi, dan storefront diuji setelah rilis.
- [ ] Log rotation dan monitoring alert (5xx, worker mati, disk) aktif.

---

## 13. Struktur file deployment

```text
deploy/
├── Dockerfile.api          # image API produksi (web + worker)
├── Dockerfile.web          # storefront Astro
├── Dockerfile.dashboard    # dashboard Nitro
├── Dockerfile.migrate      # one-shot migrasi/seed
├── Dockerfile.dev          # image development (semua service)
├── compose.dev.yml         # development
├── compose.staging.yml     # staging (database ikut)
├── compose.prod.yml        # production (database eksternal)
├── compose.prod.db.yml     # overlay Postgres self-hosted untuk production
└── env/
    ├── .env.development.example
    ├── .env.staging.example
    └── .env.production.example
```

File `deploy/docker-compose.yml` versi lama (hanya database dev) sudah digantikan
`compose.dev.yml`.
