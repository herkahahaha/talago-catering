---
language: id-ID
---

# Pemetaan PRD → implementasi

Status per bagian **System Design v2** (29 Okt 2026). Legenda: ✅ selesai · 🟡 sebagian /
mock · ⏳ fase berikutnya. ✅ berarti ada di kode, bukan berarti siap produksi.

Terakhir ditinjau terhadap commit `30ac293` (15 Nov 2026). Belum semua baris dicek ulang ke
kode (mis. keputusan #6 dan token tampilan 30 menit).


## Keputusan bisnis

| # | Keputusan | Default di `settings` | Status |
| :-- | :-- | :-- | :-- |
| 1 | Minimal 50 porsi per order (total semua menu, ADR 0001 O1) | `order.min_portions = 50`; validasi `MIN_ORDER_NOT_MET` | ✅ |
| 2 | 200 porsi/hari | `capacity.max_regular = 200` | ✅ |
| 3 | Target minimum produksi hanya indikator dapur, bukan syarat checkout (ADR 0001 O2) | tidak memblokir checkout; produksi tetap berjalan walau target belum tercapai | ✅ |
| 4 | PO di atas batas order (default >200), kapasitas dapur bersama | setting `capacity.max_po` = 500, tetapi hari baru dibuat dengan `max_po = 0` (admin membuka kuota PO per tanggal); `kitchen_max_total` (default 1000) + CHECK constraint | 🟡 |
| 5 | Cut-off H-1 18.00 | `daily_capacity.cut_off_at`, default H-1 18:00 WIB | ✅ |
| 6 | PO dibayar di muka | order PO `hold=true` sampai pembayaran; tunai langsung lunas | ✅ |
| 7 | Refund manual soft launch | `refunds.status=queued` → admin menyelesaikan | ✅ |
| 8 | Satu kota, ongkir gratis | zona tunggal Pontianak, `delivery.fee=0`, `resolveServiceArea` | ✅ |
| 9 | Jendela antar (pending) | jendela antar **opsional**; admin dapat mengatur manual; alur tamu tidak memaksa pilih | 🟡 |

## §3 Model kapasitas

- Partisi per tanggal dengan baris atomik `daily_capacity` ✅
- Aturan `max_regular + max_po <= kitchen_max_total` ditolak di service **dan** CHECK database ✅
- Stop antar per jendela + penolakan saat penuh ✅
- Batas porsi per order dapat dikonfigurasi admin (default **200**, menggantikan cap 50 sesuai permintaan bisnis); di atas batas → quotation (`ORDER_TOO_LARGE` → `/quote`) ✅
- Uji beban level database 5.000 percobaan ✅ (`tests/integration/reservation.test.ts`)

## §4 Reservasi, hold, pembayaran

| Butir | Implementasi | Status |
| :-- | :-- | :-- |
| 5 status + 2 jalur keluar | `ORDER_STATUSES` di contracts; `paid_after_expiry` sebagai status khusus | ✅ |
| Status hanya maju, koreksi lewat audit | `FORWARD_TRANSITIONS`, `updateOrderStatusAdmin`, `audit_log` | ✅ |
| Reservasi atomik + expiry malas | `capacity/reserve.ts`: expiry → reserve dalam satu transaksi | ✅ |
| `hold_ceiling` | kolom per tanggal + validasi `HOLD_LIMIT` | ✅ |
| Worker pembersih tiap menit | job `hold-sweep` (`* * * * *`) | ✅ |
| Webhook idempoten + aturan 5 butir | `checkout.handlePaymentWebhook`; dedupe `webhook_events`; signature. Gateway masih mock; jendela timestamp anti-replay belum ada | 🟡 |
| Cut-off mengunci rekap | `production_locked_at` via job `production-lock`; rekap membaca status terkunci | ✅ |

## §5 Perlindungan bot & rate limit

| Lapisan | Implementasi | Status |
| :-- | :-- | :-- |
| WAF/CDN rate limit IP | Belum (edge) — header & CSP disiapkan | ⏳ |
| CAPTCHA sebelum hold | provider `challenge` (HMAC) / `turnstile` | ✅ |
| Hold aktif per nomor (1) | `countActiveHolds` + `HOLD_LIMIT` | ✅ |
| Hold per IP 3/jam | `rate_limits` kunci `order:ip:*`. IP diambil dari header `X-Forwarded-For` tanpa trusted proxy (`apps/api/src/lib/http.ts`), sehingga klien dapat melewatinya | 🟡 |
| Cap porsi per order 200 | `ORDER_TOO_LARGE` | ✅ |
| Plafon hold per tanggal 50% | `hold_ceiling` | ✅ |
| Idempotency-Key wajib | header + unique constraint + replay | ✅ |
| Admin 300/menit/user | middleware staf | ✅ |
| OTP adaptif | OTP setelah 2 hold kedaluwarsa atau hold aktif melebihi batas; `OTP_REQUIRED`. Kode dikirim lewat outbox mock, jadi belum sampai ke pelanggan | 🟡 |
| Degradasi baca saat DB bermasalah | belum | ⏳ |

## §6 Arsitektur & struktur repo

| Butir | Status |
| :-- | :-- |
| Satu image, `ROLE=web`/`ROLE=worker` | ✅ (`apps/api/src/index.ts`) |
| PostgreSQL tunggal, tanpa Redis/broker | ✅ (pg-boss memakai Postgres) |
| Monorepo ringan + Turborepo | ✅ |
| Modul memiliki tabel sendiri + lint batas | ✅ (`scripts/check-boundaries.mjs`) |
| `core` tidak mengimpor Next/kerangka web | ✅ (hanya Drizzle + Zod) |
| Pemicu pemecahan aplikasi | dicatat di `docs/architecture.md` §9, belum perlu |

## §7 Skema database

| Tabel PRD | Nama di implementasi | Catatan |
| :-- | :-- | :-- |
| customers | `customers` | ✅ |
| accounts | — | ⏳ fase 3 |
| addresses | `addresses` | ✅ |
| service_zones | `service_zones` | ✅ |
| menu_items, menu_schedule | idem | ✅ |
| daily_capacity | idem | ✅ + `production_locked_at` |
| delivery_windows | idem | ✅ |
| orders, order_items | idem | ✅ |
| payments | `payments` | ✅ |
| refunds | `refunds` | ✅ |
| deliveries | `deliveries` | ✅ (status & bukti disiapkan) |
| quotations, purchase_orders | idem | 🟡 tabel ada; hanya buat (`POST /quotes`) dan daftar (`GET /admin/quotations`). Belum ada ubah status atau konversi ke PO, dan `purchase_orders` belum dipakai kode (fase 2) |
| idempotency_keys | idem | ✅ |
| audit_log | idem | ✅ |
| order_notes_internal | idem | ✅ |
| — tambahan | `guest_sessions`, `staff_users`, `staff_sessions`, `otp_challenges`, `rate_limits`, `captcha_challenges`, `webhook_events`, `notifications`, `settings` | prasyarat operasional |

Indeks penting (orders per tanggal/status, hold expiry parsial, payments gateway_ref unik) ada di
`packages/core/drizzle/0000_init.sql`.

## §8 API

| Endpoint PRD | Implementasi | Status |
| :-- | :-- | :-- |
| POST /sessions | ✅ | |
| GET /service-area | ✅ | |
| POST /auth/otp, /auth/verify | ✅ | |
| GET /availability | ✅ | + sisa porsi & jendela |
| POST /orders | ✅ | CAPTCHA + Idempotency-Key |
| GET /orders/{token} | ✅ | token acak, hash di DB |
| POST /orders/{id}/payment-retry | ✅ | |
| POST /orders/{id}/cancel | ✅ | refund otomatis diantrekan |
| POST /webhooks/payment | ✅ | idempoten + signature |
| Admin/dapur/kurir | orders, overview bulanan, menu CRUD, days (date picker + terapkan mingguan), production, refunds, audit, quotations (daftar saja) | ✅ |
| Lacak pesanan tamu (tambahan) | `GET /orders/mine`, `POST /orders/lookup`, token tampilan bertanda tangan 30 menit | ✅ |
| Kode error tambahan | `HOLD_LIMIT`, `CAPTCHA_REQUIRED`, `ORDER_TOO_LARGE` + `MIN_ORDER_NOT_MET`, `OTP_REQUIRED` | ✅ |

## §9 UX flow

| Langkah | Status |
| :-- | :-- |
| Lokasi & zona (ketik kecamatan, “lihat menu dulu”) | ✅ (peta opsional belum) |
| Identitas + consent | ✅ |
| Menu & tanggal, sisa porsi, keranjang satu tanggal | ✅ (peringatan ganti tanggal) |
| Pengiriman & pembayaran (jendela, ongkir, metode) | ✅ (ongkir gratis) |
| CAPTCHA + hold countdown | ✅ |
| Timeline status, tautan unik | ✅ |
| WhatsApp, kwitansi email | 🟡 hanya outbox: worker menandai terkirim tanpa mengirim; kanal nyata (SMTP, WhatsApp API) belum dipasang |
| Pesan error dengan jalan keluar | ✅ (`hint` pada error, sisa porsi) |
| Kalender “butuh X porsi agar produksi” | ⏳ (target internal belum ditampilkan publik) |

Layar internal: dashboard order dengan **rentang satu bulan penuh + widget total pesanan dan
pendapatan** ✅, **CRUD menu hidangan** ✅, pengaturan hari (kapasitas, cut-off, jendela antar, menu
per tanggal) ✅, rekap produksi + cetak ✅, rute antar ⏳ (fase 2).

## §10 Roadmap

Fase 1a–1d selesai pada level thin slice (lihat `docs/README.md` §7). Fase 2/3 belum.

## §11 Pengujian & go-live

| Kriteria | Status |
| :-- | :-- |
| 5.000 checkout konkuren tidak melewati max | 🟡 level DB lulus (5.000 percobaan). Uji beban checkout di dev, 15 Nov 2026 (port Node dari `scripts/load-checkout.js`; k6 belum terpasang; mesin 2 core berbagi dengan generator beban): 5.278 order, kapasitas tidak pernah terlampaui, tetapi p95 1.074 ms (ambang 800 ms, gagal) dan 3 respons 500 akibat tabrakan `order_no`. Ulangi dengan k6 di hardware khusus |
| Bot tidak melewati plafon hold; hold lepas tanpa job | ✅ tes integrasi |
| Webhook duplikat/terbalik/signature salah/telat | ✅ tes integrasi (urutan terbalik: event `failed` setelah `settled` diabaikan sebagai duplikat status) |
| Beban baca 280 rps CDN / 56 rps origin | ⏳ perlu k6 di environment uji; `scripts/load-checkout.js` hanya mengukur alur checkout, skenario baca (availability, menu) belum ada |
| Restore backup & RPO/RTO | 🟡 dieksekusi sekali di dev (15 Nov 2026, satu server, ±5.300 order): dump 0,27 dtk, restore 0,61 dtk, 40 tabel identik (jumlah baris + hash), API berjalan di DB hasil restore. Belum diuji: PITR, restore ke host baru, penetapan RPO/RTO |
| Uji injeksi catatan & otorisasi peran | 🟡 rendering teks aman; uji formal belum |
| Simulasi satu hari penuh | ⏳ |

## §12 Metrik

Belum ada instrumentasi APM. Yang tersedia: `audit_log`, `webhook_events`, status order, dan query
SQL di docker. Rekomendasi: tambahkan metrik Prometheus/OTel di fase 1d lanjutan (konversi,
rasio hold→bayar, porsi terisi, refund, p95 latency).

## §13 Risiko

- Gateway asli belum dipasang; perilaku QRIS/VA nyata (termasuk biaya refund) belum divalidasi.
- Parameter anti-bot (plafon hold, cap porsi) masih nilai awal; perlu disetel lewat load test dan
  observasi soft launch.
- Jendela antar masih opsional karena keputusan #9 belum final.
- Data Mejamakan/Kendixpress dari v1 tidak diverifikasi ulang; alur Kendixpress belum dijadikan
  acuan implementasi.
- Notifikasi dan OTP masih mock: tidak ada pesan nyata ke pelanggan, dan OTP di production tidak
  akan terkirim sebelum kanal dipasang.
- IP klien diambil dari `X-Forwarded-For` tanpa trusted proxy, sehingga semua batas per IP (sesi,
  order, lookup, login admin) dapat dilewati. Perilaku di balik Caddy atau Cloudflare belum diuji.
- Percobaan ulang saat nomor order bertabrakan tidak berjalan (Drizzle 0.45 menaruh kode galat di
  `error.cause.code`), sehingga tabrakan `order_no` menjadi HTTP 500. Jarang di volume nyata.
- `SESSION_SECRET`, `CAPTCHA_SECRET`, `PAYMENT_WEBHOOK_SECRET`, dan password admin seed punya nilai
  default; belum ada penjaga yang menolak start di `NODE_ENV=production`.
- Alur quotation → PO belum ada: pesanan di atas batas order berakhir di daftar quotation tanpa
  tindak lanjut di sistem.
