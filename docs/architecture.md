# Arsitektur

## 1. Topologi

```
                     Cloudflare (CDN + WAF)  ── cache: menu, availability, aset
                              │
        ┌─────────────────────┼─────────────────────────┐
        │                     │                         │
  apps/web (Astro SSR)  apps/api (Hono, ROLE=web)  apps/dashboard (TanStack Start)
  storefront tamu       2 instance, autoscale 4     internal, origin terpisah
        │                     │                         │
        └───────────┬─────────┴─────────────┬───────────┘
                    │                       │
            packages/contracts        PostgreSQL 16 (primary, pooler, PITR)
                    │                       │
            packages/core (domain)   ── pg-boss (schema `pgboss`)
                    │                       │
            apps/api (ROLE=worker, 1 container kecil)
```

- Satu monolith modular; tidak ada Redis, broker, search engine, atau microservice.
- Worker memakai **image yang sama** dengan web; hanya `ROLE` yang berbeda.
- Semua frontend berbicara ke satu API `/api/v1`; tipe dibagi lewat `packages/contracts`.

## 2. Peta modul (`packages/core/src/modules`)

| Modul | Tabel miliknya | Fungsi publik utama |
| :-- | :-- | :-- |
| `settings` | `settings` | konfigurasi runtime (default PRD §2/§5) |
| `catalog` | `menu_items`, `menu_schedule` | menu per tanggal, jadwal hidangan |
| `capacity` | `daily_capacity` | partisi harian, reservasi atomik, pengaturan hari |
| `delivery` | `delivery_windows`, `deliveries` | jendela antar, stop, status kirim |
| `customers` | `customers`, `addresses`, `guest_sessions`, `service_zones` | sesi tamu, zona, data pelanggan |
| `orders` | `orders`, `order_items`, `idempotency_keys`, `order_notes_internal` | siklus hidup order, idempotensi, produksi |
| `payments` | `payments`, `webhook_events` | tagihan, gateway adapter, dedupe webhook |
| `refunds` | `refunds` | kebijakan refund manual |
| `checkout` | — (orkestrasi) | checkout tamu, webhook, pembatalan, order admin |
| `auth` | `staff_users`, `staff_sessions`, `otp_challenges` | login staf, sesi, OTP adaptif |
| `security` | `rate_limits`, `captcha_challenges` | rate limit DB, CAPTCHA |
| `audit` | `audit_log` | jejak audit semua transisi |
| `notifications` | `notifications` | outbox email/WhatsApp |
| `quotations` | `quotations`, `purchase_orders` | jalur penawaran di atas batas order |

Aturan: modul hanya mengekspos `index.ts`; `pnpm lint` menjalankan
`scripts/check-boundaries.mjs` dan menolak impor ke file internal modul lain.

## 3. Invarian kapasitas

Satu baris `daily_capacity` per tanggal adalah kunci atomik:

```
reserved_regular  porsi yang sudah dipesan (hold + lunas)
held_regular      porsi yang masih berstatus pending_payment
max_regular       batas partisi reguler
hold_ceiling      plafon porsi berstatus hold (default 50% max_regular)
```

Reservasi (`capacity/reserve.ts`) berjalan dalam transaksi:

1. **Lazy expiry** — `UPDATE orders SET status='expired' ... RETURNING` untuk tanggal yang sama.
   Baris yang sudah diubah transaksi lain tidak lagi memenuhi predikat → tidak dobel lepas.
2. **Pelepasan** — `reserved_*`/`held_*` dikurangi sejumlah porsi yang dilepas; stop jendela antar
   dikembalikan.
3. **Reservasi** — satu `UPDATE daily_capacity` bersyarat:
   `is_open AND now() < cut_off_at AND reserved + n <= max AND held + n <= hold_ceiling`.
   0 baris = penuh/tutup/cut-off; API memetakan ke `CAPACITY_FULL`, `DAY_CLOSED`,
   `CUTOFF_PASSED`, atau `HOLD_LIMIT`.
4. Order + item + delivery + audit ditulis, lalu `COMMIT`.

CHECK constraint di database (`max_regular + max_po <= kitchen_max_total`,
`held <= reserved`, non-negatif) menjadi jaring pengaman terakhir.

**Bukti empiris:** `packages/core/tests/integration/reservation.test.ts` menjalankan 5.000
percobaan reservasi konkuren pada satu tanggal; hanya 4 berhasil untuk 200 porsi × 50 porsi,
`reserved_regular == 200`, tidak pernah melebihi maksimum. Uji plafon hold juga membatasi
100 porsi meski ada 120 percobaan.

## 4. Alur checkout tamu

```
POST /sessions            → pelanggan + cookie sesi (httpOnly, hash di DB)
GET  /availability        → sisa porsi per tanggal, jendela antar
GET  /menu?date=          → hidangan terjadwal + sisa porsi
POST /captcha             → tantangan aritmetika bertanda tangan HMAC
POST /orders              → Idempotency-Key + CAPTCHA + rate limit + reservasi atomik
   ├─ validasi sesi, tanggal, menu, minimal 50 porsi, batas porsi per order (default 200)
   ├─ idempotensi: klaim kunci → replay / konflik
   ├─ createPendingOrder (transaksi): expiry → reserve → stop → order → item → delivery → audit
   └─ pasca-commit: tagihan gateway (mock), outbox notifikasi
GET  /orders/{token}      → tautan status (token mentah tidak disimpan; hanya hash)
POST /orders/{id}/payment-retry → tagihan baru selama hold berlaku
POST /orders/{id}/cancel  → sebelum cut-off; refund diantrekan bila sudah lunas
```

Hold 10 menit dihitung dari `hold_expires_at`. Tidak ada job yang wajib berjalan agar kapasitas
benar: setiap reservasi baru membersihkan hold kedaluwarsa tanggal tersebut lebih dulu.

## 5. State machine order

```
pending_payment ──paid──► paid ──► in_production ──► out_for_delivery ──► delivered
       │                    │
       │ hold habis         │ dibatalkan
       ▼                    ▼
    expired          cancelled_refunded
       │
       └── pembayaran telat ──► paid (ini pengecualian eksplisit jika ada sisa) / paid_after_expiry + refund (jika penuh)
```

Hanya transisi maju satu arah yang diizinkan lewat API admin; koreksi lain dicatat di
`audit_log`. Pembatalan setelah cut-off hanya oleh admin.

## 6. Webhook pembayaran (PRD §4.3)

1. Verifikasi signature HMAC atas raw body → gagal: 401 + audit, tanpa efek.
2. Dedupe `event_id` (`webhook_events` unique). Duplikat → `duplicate`, tanpa efek ganda.
3. Cocokkan `gateway_ref` dan nominal; tidak cocok → diabaikan + audit.
4. `settled`:
   - order `pending_payment` dan hold masih berlaku → `paid`, `held` dikurangi.
   - hold sudah habis → expire lalu coba reservasi ulang atomik (termasuk stop jendela antar).
     Berhasil → `paid`. Penuh → `paid_after_expiry`, refund `queued`, notifikasi.
5. `failed`/`expired` → status pembayaran diperbarui; hold akan kedaluwarsa normal.
6. Setiap langkah menulis `audit_log` dan menandai event `processed_at`.

## 7. Data & indeks penting

- `orders(service_date, status)`, `orders(customer_id, created_at)`,
  `orders(hold_expires_at) WHERE status='pending_payment'`, `orders(created_ip, created_at)`.
- `payments(gateway_ref)` unik; `webhook_events(event_id)` unik.
- `daily_capacity(service_date)` primary key.
- `menu_schedule(menu_item_id, service_date)` unik.
- FK fisik ditambahkan lewat migrasi kustom `0001_foreign_keys.sql` agar file schema per modul
  tidak saling mengimpor.

## 8. Auth & keamanan

| Subjek | Mekanisme |
| :-- | :-- |
| Tamu | cookie `cg_session` httpOnly, token 256-bit, hash SHA-256 di `guest_sessions`, 7 hari |
| Tautan status order | token 256-bit; hanya hash yang disimpan; token diturunkan HMAC untuk replay idempoten |
| Staf | password scrypt (`N=16384,r=8,p=1`), cookie `cg_staff`, sesi 8 jam, RBAC `admin/kitchen/courier` |
| OTP | 6 digit, hash HMAC, 5 menit, maks 5 percobaan, rate limit per nomor |
| Rate limit | tabel `rate_limits`, jendela tetap, kunci per IP / sesi / nomor / staf |
| CAPTCHA | provider `challenge` (HMAC) atau `turnstile` |
| Headers | API: nosniff, DENY frame, referrer policy; storefront: CSP baseline + headers |
| Catatan pelanggan | dirender sebagai teks (auto-escape), tidak ada `innerHTML` |

## 9. Deployment

Seluruh aplikasi berjalan di Docker. Tiga compose terpisah: `deploy/compose.dev.yml`,
`deploy/compose.staging.yml`, dan `deploy/compose.prod.yml` (opsional `compose.prod.db.yml` untuk
Postgres self-hosted). Panduan lengkap: [`docker.md`](docker.md).

- Satu image API (`deploy/Dockerfile.api`), dua peran: `ROLE=web` (`:3000`) dan
  `ROLE=worker` (tanpa port publik). Image non-root, multi-stage, hanya dependency produksi.
- Storefront `deploy/Dockerfile.web` (`:4321`), dashboard `deploy/Dockerfile.dashboard` (`:3001`,
  `VITE_API_URL` di-inject saat build), migrasi `deploy/Dockerfile.migrate` (one-shot).
- Service `migrate` berjalan sebelum API/worker/web/dashboard; aplikasi menunggu migrasi sukses.
- Development memakai `Dockerfile.dev` + bind mount `src/` untuk hot reload; staging/production
  memakai image immutable bertag versi.
- CDN/WAF: cache hanya `/menu`, `/availability`, aset statis; HTML tamu dinamis (cookie sesi) tidak
  di-cache penuh.
- Pemicu pemecahan aplikasi mengikuti PRD §6.3 (rilis admin merusak checkout → pisahkan
  `apps/backoffice`; kurir butuh offline → PWA sendiri; >3 frontend dev atau aplikasi native →
  tambah `packages/ui` + aktifkan Turborepo remote cache; lebih dari satu dapur/kota →
  `kitchen_id` + partisi per dapur).
