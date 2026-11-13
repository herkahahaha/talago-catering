# Pemetaan PRD → implementasi

Status per bagian **System Design v2** (29 Okt 2026). Legenda: ✅ selesai · 🟡 sebagian /
mock · ⏳ fase berikutnya.


## Keputusan bisnis

| # | Keputusan | Default di `settings` | Status |
| :-- | :-- | :-- | :-- |
| 1 | Porsi, minimal order 20 qty dari setiap menu | `order.min_portions = 20`; validasi `MIN_ORDER_NOT_MET` | ✅ |
| 2 | 200 porsi/hari | `capacity.max_regular = 200` | ✅ |
| 3 | Minimal 50 untuk target produksi harian syarat keras | ditolak sebelum reservasi; produksi tetap berjalan walau target belum tercapai | ✅ |
| 4 | PO 201–1000, kapasitas dapur bersama | `max_po` per tanggal + `kitchen_max_total` + CHECK constraint | ✅ |
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
| Webhook idempoten + aturan 5 butir | `checkout.handlePaymentWebhook`; dedupe `webhook_events`; signature | ✅ (gateway mock) |
| Cut-off mengunci rekap | `production_locked_at` via job `production-lock`; rekap membaca status terkunci | ✅ |

## §5 Perlindungan bot & rate limit

| Lapisan | Implementasi | Status |
| :-- | :-- | :-- |
| WAF/CDN rate limit IP | Belum (edge) — header & CSP disiapkan | ⏳ |
| CAPTCHA sebelum hold | provider `challenge` (HMAC) / `turnstile` | ✅ |
| Hold aktif per nomor (1) | `countActiveHolds` + `HOLD_LIMIT` | ✅ |
| Hold per IP 3/jam | `rate_limits` kunci `order:ip:*` | ✅ |
| Cap porsi per order 200 | `ORDER_TOO_LARGE` | ✅ |
| Plafon hold per tanggal 50% | `hold_ceiling` | ✅ |
| Idempotency-Key wajib | header + unique constraint + replay | ✅ |
| Verifikasi signature webhook | HMAC-SHA256 + timestamp di payload | ✅ |
| Admin 300/menit/user | middleware staf | ✅ |
| OTP adaptif | OTP setelah 2 hold kedaluwarsa atau hold aktif melebihi batas; `OTP_REQUIRED` | ✅ |
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
| quotations, purchase_orders | idem | ✅ (alur lengkap fase 2) |
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
| Admin/dapur/kurir | orders, overview bulanan, menu CRUD, days (date picker + terapkan mingguan), production, refunds, audit, quotations | ✅ |
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
| Timeline status, WhatsApp, tautan unik, kwitansi email | ✅ (email via outbox/mock) |
| Pesan error dengan jalan keluar | ✅ (`hint` pada error, sisa porsi) |
| Kalender “butuh X porsi agar produksi” | ⏳ (target internal belum ditampilkan publik) |

Layar internal: dashboard order dengan **rentang satu bulan penuh + widget total pesanan dan
pendapatan** ✅, **CRUD menu hidangan** ✅, pengaturan hari (kapasitas, cut-off, jendela antar, menu
per tanggal) ✅, rekap produksi + cetak ✅, rute antar ⏳ (fase 2).

## §10 Roadmap

Fase 1a–1d selesai pada level thin slice (lihat README §7). Fase 2/3 belum.

## §11 Pengujian & go-live

| Kriteria | Status |
| :-- | :-- |
| 5.000 checkout konkuren tidak melewati max | 🟡 hanya level DB; kriteria PRD-nya adalah checkout |
| Bot tidak melewati plafon hold; hold lepas tanpa job | ✅ tes integrasi |
| Webhook duplikat/terbalik/signature salah/telat | ✅ tes integrasi (urutan terbalik: event `failed` setelah `settled` diabaikan sebagai duplikat status) |
| Beban baca 280 rps CDN / 56 rps origin | ⏳ perlu k6 di environment uji (`scripts/load-checkout.js`) |
| Restore backup & RPO/RTO | ⏳ prosedur ada di runbook, belum dieksekusi |
| Uji injeksi catatan & otorisasi peran | 🟡 rendering teks aman; uji formal belum |
| Simulasi satu hari penuh | ⏳ |

## §12 Metrik

Belum ada instrumentasi APM. Yang tersedia: `audit_log`, `webhook_events`, status order, dan query
SQL di runbook. Rekomendasi: tambahkan metrik Prometheus/OTel di fase 1d lanjutan (konversi,
rasio hold→bayar, porsi terisi, refund, p95 latency).

## §13 Risiko

- Gateway asli belum dipasang; perilaku QRIS/VA nyata (termasuk biaya refund) belum divalidasi.
- Parameter anti-bot (plafon hold, cap porsi) masih nilai awal; perlu disetel lewat load test dan
  observasi soft launch.
- Jendela antar masih opsional karena keputusan #9 belum final.
- Data Mejamakan/Kendixpress dari v1 tidak diverifikasi ulang; alur Kendixpress belum dijadikan
  acuan implementasi.
