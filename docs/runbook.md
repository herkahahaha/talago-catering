# Runbook operasional

Dokumen ini untuk on-call dan admin dapur. Semua waktu adalah **WIB (UTC+7)**.

## 1. Deploy pertama

### 1.1 Docker (disarankan)

```bash
cp deploy/env/.env.production.example deploy/env/.env.production
# isi DATABASE_URL, SESSION_SECRET, CAPTCHA_SECRET, PAYMENT_WEBHOOK_SECRET,
# PUBLIC_API_URL, APP_URL, DASHBOARD_URL, IMAGE_TAG
docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml up -d
docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml ps
curl -fsS http://127.0.0.1:3000/health

# Admin pertama: lihat "Admin pertama (bootstrap)" di bawah. Belum ada perintah di repo.
```

Compose menjalankan `migrate` lebih dulu; API/worker/web/dashboard baru dibuat setelah migrasi
sukses. Seed tidak tersedia di production. Detail lengkap: [`docker.md`](docker.md).

### 1.2 Native (tanpa Docker)

```bash
cp .env.example .env
# isi DATABASE_URL, SESSION_SECRET, CAPTCHA_SECRET, PAYMENT_WEBHOOK_SECRET, APP_URL, DASHBOARD_URL
pnpm install --frozen-lockfile
pnpm db:migrate          # WAJIB sebelum menaikkan versi aplikasi
pnpm db:seed             # hanya untuk environment non-production
pnpm build
```

Urutan rilis: migrasi → API baru → worker baru → storefront → dashboard. Migrasi dirancang
additive; bila ada perubahan destruktif, lakukan expand/contract dua langkah.

### 1.3 Admin pertama (bootstrap)

Satu-satunya sumber untuk prosedur ini. Status: **rencana, belum diimplementasikan** (tidak ada
script `admin:create` di `package.json`).

Rencana: CLI sekali jalan dijalankan lewat compose production, misalnya
`docker compose --env-file deploy/env/.env.production -f deploy/compose.prod.yml run --rm migrate pnpm admin:create --email <email> --role admin`.

Aturan yang harus dipenuhi sebelum dianggap selesai:

1. Password diminta lewat prompt, tidak lewat argumen, dan tidak pernah dicetak.
2. Menolak berjalan bila sudah ada admin, kecuali memakai flag eksplisit.
3. Menulis `audit_log` dengan aktor `cli`.
4. Perintah yang sama dipakai untuk reset password dan membuat peran `kitchen` atau `courier`.
   Reset password juga menghapus `staff_sessions` milik pengguna itu.

Sampai CLI tersedia, admin pertama dibuat dengan INSERT manual ke database. Catat langkah itu di
`audit_log` secara manual. Jangan menyimpan password admin di env production.

## 2. Pemeriksaan harian

| Pemeriksaan | Cara |
| :-- | :-- |
| API & DB sehat | `curl -s $API/health` → `{status:"ok",db:"ok"}` |
| Worker hidup | log worker `worker siap`; tabel `pgboss.schedule` berisi 4 jadwal |
| Order menumpuk di hold | dashboard: stat “Hold aktif” vs plafon; order `pending_payment` lewat `hold_expires_at` |
| Rekap produksi | dashboard → Rekap produksi → pilih tanggal → Cetak |
| Refund mengantre | dashboard → Refund → filter “Menunggu antrean” |
| Error 5xx | `x-request-id` pada respons, log API JSON `level:error` |

Query bantu:

```sql
-- hold yang seharusnya sudah lepas
SELECT order_no, service_date, portions, hold_expires_at
FROM orders
WHERE status = 'pending_payment' AND hold_expires_at < now()
ORDER BY hold_expires_at;

-- kapasitas tanggal tertentu
SELECT * FROM daily_capacity WHERE service_date = '2026-11-06';

-- webhook yang belum diproses
SELECT event_id, gateway_ref, event_type, created_at
FROM webhook_events WHERE processed_at IS NULL ORDER BY created_at;
```

## 3. Cut-off & penguncian produksi

- Cut-off default H-1 18.00 WIB per tanggal (`daily_capacity.cut_off_at`), dapat diubah admin di
  **Pengaturan hari**.
- Worker `production-lock` berjalan tiap 5 menit: mengisi `production_locked_at` dan menutup hari.
- Rekap produksi otomatis terkunci setelah cut-off. Perubahan setelah cut-off hanya lewat admin
  (aksi tercatat di audit log).

## 4. Refund manual (soft launch)

1. Buka dashboard → **Refund** → filter `queued`.
2. Lakukan pengembalian dana di dashboard gateway (Midtrans/Xendit) atau transfer bank.
3. Catat kanal + nomor referensi → **Selesaikan**.
4. Sistem menandai refund `completed`, mengubah pembayaran menjadi `refunded`, dan mengirim
   notifikasi (mock pada thin slice).

## 5. Backup & restore

- Production wajib PITR pada PostgreSQL terkelola (region Jakarta/Singapura).
- Latihan restore minimal sekali sebelum go-live:
  ```bash
  pg_dump --format=custom --no-owner "$DATABASE_URL" > backup.dump
  createdb catering_restore
  pg_restore --no-owner --dbname=catering_restore backup.dump
  DATABASE_URL=postgres://.../catering_restore pnpm db:migrate
  # verifikasi: jumlah order, kapasitas, dan hash migrasi
  ```
- Catat RPO/RTO sebenarnya. Target v1: RPO menit, RTO 30–60 menit (konfirmasi ke provider).

## 6. Playbook insiden

### 6.1 Database tidak tersedia

Gejala: `/health` → `503`, API 500, log `idle client error`.

1. Pastikan gangguan bukan pada pooler/kredensial.
2. Mode baca/degradasi penuh (menu statis + antrean checkout) belum diimplementasikan pada thin
   slice. Tindakan sementara: arahkan CDN ke halaman statis “sedang sibuk” dan hentikan trafik
   checkout.
3. Webhook tetap diterima setelah DB pulih; event idempoten sehingga aman di-retry gateway.

### 6.2 Hold menumpuk / kapasitas “hilang”

1. Jalankan worker sweep: pastikan worker hidup; job `hold-sweep` tiap menit.
2. Manual (aman, idempoten):
   ```bash
   pnpm --filter @catering/core exec tsx -e "import { sweepExpiredHolds, getDatabase } from './src/index.ts'; console.log(await sweepExpiredHolds(getDatabase().db)); process.exit(0)"
   ```
   Jalankan dari `packages/core`.
3. Bila `held_regular` tidak cocok dengan order nyata, bandingkan:
   ```sql
   SELECT COALESCE(SUM(portions),0) FROM orders
   WHERE service_date='2026-11-06' AND status='pending_payment';
   ```
   Selisih = data korup; eskalasi ke engineering, jangan mengubah angka langsung tanpa audit.

### 6.3 Pembayaran masuk tetapi order masih pending

1. Cek `webhook_events` untuk `gateway_ref` tersebut.
2. Bila tidak ada event: gateway gagal mengirim. Kirim ulang dari dashboard gateway; handler
   idempoten.
3. Bila event `processed` tetapi order belum berubah: cek `audit_log` untuk `order_paid` /
   `order_paid_after_expiry`; gunakan `x-request-id` untuk korelasi log.

### 6.4 Salah kapasitas / perlu koreksi

- Ubah melalui **Pengaturan hari** (validasi otomatis menolak nilai di bawah porsi terpesan).
- Koreksi status order manual oleh admin tercatat di audit log; jangan `UPDATE` langsung.

## 7. Load test & go-live (PRD §11)

Implementasi saat ini membuktikan invarian kapasitas pada level database (5.000 percobaan).
Sebelum go-live, jalankan uji HTTP penuh:

```bash
# contoh k6 (pasang k6 terlebih dahulu)
k6 run -e BASE=https://api.staging.example.id scripts/load-checkout.js
```

Skenario minimum:

1. 5.000 percobaan checkout dalam 1 menit pada satu tanggal → `reserved_regular ≤ max_regular`.
2. Webhook duplikat, urutan terbalik, signature salah, pembayaran setelah expiry (dengan dan tanpa
   sisa kapasitas).
3. Beban baca ±280 rps di CDN / ±56 rps ke origin selama 30 menit tanpa error; ukur cache hit.
4. Uji injeksi catatan pelanggan di dashboard (harus tampil sebagai teks) dan otorisasi per peran.
5. Simulasi satu hari penuh bersama dapur & kurir.

## 8. Rotasi kredensial

| Rahasia | Dampak rotasi |
| :-- | :-- |
| `SESSION_SECRET` | semua tautan status lama & OTP batal; sesi tamu tetap valid (hash token disimpan) |
| `CAPTCHA_SECRET` | tantangan CAPTCHA yang sedang berjalan batal |
| `PAYMENT_WEBHOOK_SECRET` | webhook selama jendela rotasi ditolak; putar bersamaan dengan gateway |
| Password staf | ubah lewat seed/admin; sesi aktif tidak otomatis batal (pertimbangkan hapus `staff_sessions`) |

## 9. Hal yang belum ada di thin slice

- Mode baca otomatis saat DB bermasalah.
- Retensi data pribadi otomatis & permintaan penghapusan (UU PDP) — kebijakan tertulis masih perlu.
- Kurir PWA, bukti serah terima foto, invoice/kwitansi PDF.
- Rekonsiliasi otomatis payout gateway.
