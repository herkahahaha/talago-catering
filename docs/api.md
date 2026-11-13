# API v1

Base URL: `{API_BASE_URL}/api/v1`. Semua respons sukses berbentuk `{ "data": ... }`; semua error
berbentuk `{ "error": { "code", "message", "hint?", "details?" }, "requestId" }`.

Konvensi:

- Uang: bilangan bulat rupiah (`910000`).
- Tanggal layanan: `YYYY-MM-DD` (kalender WIB).
- Timestamp: ISO 8601 dengan offset (`2026-11-05T11:00:00.000Z`).
- Autentikasi tamu: cookie `cg_session` (httpOnly, SameSite=Lax, 7 hari).
- Autentikasi staf: cookie `cg_staff` (httpOnly, 8 jam). Origin dashboard terpisah.
- Setiap respons memiliki header `x-request-id` untuk korelasi log.

## Publik

| Metode | Path | Keterangan |
| :-- | :-- | :-- |
| POST | `/sessions` | Buat sesi tamu dari nama + nomor HP + consent |
| GET | `/service-area?district=`/`?lat=&lng=` | Cek zona & ongkir |
| GET | `/menu?date=` | Hidangan terjadwal + sisa porsi |
| GET | `/availability?from=&days=` | Sisa porsi & jendela antar 1–30 hari |
| POST | `/captcha` | Tantangan CAPTCHA (`challengeId`, `question`, `expiresAt`) |
| POST | `/orders` | Buat order (butuh cookie, `Idempotency-Key`, `captchaToken`) |
| GET | `/orders/mine` | Daftar pesanan milik sesi tamu di perangkat ini |
| POST | `/orders/lookup` | Cari pesanan dengan nomor order + nomor HP (rate limit 10/10 menit) |
| GET | `/orders/{token}` | Status order lewat tautan acak **atau** token tampilan bertanda tangan (30 menit) |
| POST | `/orders/{id}/cancel?token=` | Batalkan sebelum cut-off |
| POST | `/orders/{id}/payment-retry?token=` | Tagihan baru selama hold berlaku |
| POST | `/auth/otp` | Kirim OTP (WhatsApp/SMS, adaptif) |
| POST | `/auth/verify` | Verifikasi OTP; menandai sesi tamu terverifikasi |
| POST | `/quotes` | Permintaan penawaran di atas batas order (default 200 porsi) |
| POST | `/webhooks/payment` | Webhook gateway (signature HMAC) |
| POST | `/dev/payments/{gatewayRef}/settle` | Simulasi bayar — hanya non-production |

### Contoh: `POST /orders`

```http
POST /api/v1/orders
Cookie: cg_session=...
Idempotency-Key: 3f52c1d0-5a9a-4c6f-9e5c-2f0a8a2b1c11
Content-Type: application/json
```

```json
{
  "serviceDate": "2026-11-06",
  "items": [
    { "menuItemId": "…", "portions": 20 },
    { "menuItemId": "…", "portions": 30 }
  ],
  "delivery": {
    "windowId": "…",
    "address": { "line": "Jl. Gajah Mada No. 12", "district": "Pontianak Kota" },
    "recipientName": "Ibu Rina",
    "recipientPhone": "081234567890"
  },
  "paymentMethod": "qris",
  "captchaToken": "<challengeId>.<jawaban>",
  "notes": "Sambal dipisah",
  "consent": true
}
```

Respons `201`:

```json
{
  "data": {
    "order": {
      "id": "…",
      "orderNo": "CG-261106-EV43",
      "status": "pending_payment",
      "serviceDate": "2026-11-06",
      "portions": 50,
      "subtotal": 910000,
      "deliveryFee": 0,
      "total": 910000,
      "holdExpiresAt": "2026-11-03T13:05:00.000Z",
      "items": [
        { "name": "Ayam Bakar Madu", "portions": 30, "unitPrice": 25000, "lineTotal": 750000 }
      ],
      "payment": { "gatewayRef": "MOCK-…", "status": "pending", "method": "qris" },
      "timeline": [{ "status": "pending_payment", "at": "…" }]
    },
    "statusToken": "…",
    "statusUrl": "https://pesan.example.id/order/…",
    "paymentInstructions": {
      "gatewayRef": "MOCK-…",
      "method": "qris",
      "amount": 910000,
      "expiresAt": "…",
      "reference": "QRIS-SIM-…",
      "instructions": "…"
    }
  }
}
```
Respons `200`:

Catatan:

- `Idempotency-Key` wajib (8–128 karakter). Permintaan dengan kunci sama dan payload sama
  mengembalikan order yang sama; payload berbeda → `IDEMPOTENCY_CONFLICT`.
- Minimal 50 porsi; batas maksimum per order adalah konfigurasi global (default 200, dapat diubah admin lewat `PUT /admin/settings/order`).
- CAPTCHA diverifikasi sebelum reservasi; replay idempoten tidak memerlukan CAPTCHA baru.

### Webhook

Header `x-payment-signature: <hex HMAC-SHA256(rawBody, PAYMENT_WEBHOOK_SECRET)>`.

```json
{
  "eventId": "evt-20261103-001",
  "gatewayRef": "MOCK-CG-261106-EV43-abc123",
  "status": "settled",
  "amount": 910000,
  "method": "qris",
  "paidAt": "2026-11-03T13:01:00.000Z"
}
```

`status`: `settled` | `failed` | `expired`. Idempoten per `eventId`; duplikat tidak berefek ganda.
`outcome`: `processed` | `duplicate` | `ignored` | `late_paid` | `late_unavailable`.

## Admin

Semua rute admin memerlukan cookie `cg_staff` dan dibatasi 300 permintaan/menit per staf.

| Metode | Path | Peran | Keterangan |
| :-- | :-- | :-- | :-- |
| POST | `/admin/auth/login` | publik | Email + password, rate limit 10/menit per IP |
| POST | `/admin/auth/logout` | staf | Hapus sesi |
| GET | `/admin/auth/me` | staf | Profil staf |
| GET | `/admin/orders?date=` | staf | Daftar order satu hari + ringkasan kapasitas |
| GET | `/admin/orders?from=&to=&status=&source=&q=&page=&pageSize=` | staf | Daftar order rentang tanggal (satu bulan penuh) |
| GET | `/admin/overview?month=YYYY-MM` | staf | Total pesanan, pendapatan, nilai order, porsi & rincian harian satu bulan |
| GET | `/admin/settings/order` | staf | Aturan checkout global (min, maks per order, hold) |
| PUT | `/admin/settings/order` | admin | Ubah aturan checkout global |
| PUT | `/admin/days/week/{date}` | admin | Terapkan kapasitas/cut-off/jendela antar ke Senin–Minggu |
| GET | `/admin/catalog` | staf | Katalog admin lengkap dengan status aktif & jumlah jadwal |
| POST | `/admin/menu` | admin | Tambah hidangan (otomatis dijadwalkan 14 hari) |
| PATCH | `/admin/menu/{id}` | admin | Ubah hidangan / aktif-nonaktif |
| DELETE | `/admin/menu/{id}` | admin | Nonaktifkan hidangan (soft delete) |
| GET | `/admin/orders/{id}` | staf | Detail + catatan internal + refund |
| PATCH | `/admin/orders/{id}/status` | staf | Transisi maju (`in_production`, `out_for_delivery`, `delivered`) |
| POST | `/admin/orders` | admin | Order manual / PO |
| POST | `/admin/orders/{id}/notes` | staf | Catatan internal |
| POST | `/admin/orders/{id}/cancel` | admin | Batal (boleh setelah cut-off, diaudit) |
| GET | `/admin/days/{date}` | staf | Kapasitas + jendela antar |
| PUT | `/admin/days/{date}` | admin | Ubah kapasitas, cut-off, target, jendela antar |
| GET | `/admin/production?date=` | admin, dapur | Rekap produksi |
| GET | `/admin/stats?date=` | admin, dapur | Statistik harian |
| GET | `/admin/refunds?status=` | admin | Daftar refund |
| POST | `/admin/refunds/{id}/complete` | admin | Catat penyelesaian refund |
| GET | `/admin/audit?date=&entity=&limit=` | admin | Audit log |
| GET | `/admin/quotations` | admin | Permintaan penawaran |

### Contoh: `GET /admin/overview?month=2026-11`

```json
{
  "data": {
    "month": "2026-11",
    "from": "2026-11-01",
    "to": "2026-11-30",
    "totalOrders": 4,
    "totalPortions": 240,
    "totalRevenue": 2590000,
    "grossOrderValue": 4685000,
    "paidOrders": 2,
    "pendingOrders": 2,
    "cancelledOrders": 0,
    "statusCounts": { "paid": 1, "in_production": 1, "pending_payment": 2 },
    "daily": [
      { "date": "2026-11-05", "orders": 1, "portions": 50, "revenue": 910000 }
    ]
  }
}
```

`totalRevenue` hanya menjumlahkan order yang sudah dibayar/diproses; `grossOrderValue`
menjumlahkan seluruh order (termasuk pending dan batal).

### Contoh: `POST /admin/menu`

```json
{
  "name": "Tahu Goreng Spesial",
  "description": "Tahu goreng dengan sambal kecap.",
  "category": "side",
  "price": 12000,
  "unitLabel": "porsi",
  "isActive": true
}
```

Hidangan aktif otomatis mendapat jadwal untuk 14 hari ke depan sehingga langsung tampil di
storefront. Ketersediaan per tanggal tetap dapat diubah di `PUT /admin/days/{date}/menu`.

### Contoh: `PUT /admin/days/{date}`

```json
{
  "maxRegular": 200,
  "maxPo": 500,
  "kitchenMaxTotal": 1000,
  "targetMin": 50,
  "holdCeiling": 100,
  "cutOffAt": "2026-11-05T11:00:00.000Z",
  "isOpen": true,
  "windows": [
    { "label": "Siang (11.00–13.00)", "startTime": "11:00", "endTime": "13:00", "maxStops": 10 }
  ]
}
```

Validasi: `maxRegular + maxPo <= kitchenMaxTotal`; tidak boleh turun di bawah porsi terpesan;
`holdCeiling <= maxRegular` dan `>= held` saat ini; `ceiling ≥ maxPo` Saat batas per order dinaikkan, `ensureMinimumHoldCeiling` menaikkan plafon hold hari-hari kedepan minimal sebesar batas tersebut (dibatasi `max_regular`).

## Kode error

| Kode | HTTP | Arti |
| :-- | :-- | :-- |
| `VALIDATION_ERROR` | 400 | Body/query tidak sesuai schema |
| `UNAUTHORIZED` | 401 | Sesi/ token tidak valid |
| `FORBIDDEN` | 403 | Peran tidak diizinkan |
| `CAPTCHA_REQUIRED` | 403 | CAPTCHA belum/tidak valid |
| `OTP_REQUIRED` | 403 | Verifikasi nomor HP diperlukan |
| `NOT_FOUND` | 404 | Resource tidak ada |
| `INVALID_STATE` | 409 | Transisi status tidak sah |
| `IDEMPOTENCY_CONFLICT` | 409 | Kunci idempotensi dipakai payload lain / sedang diproses |
| `RATE_LIMITED` | 429 | Melebihi batas umum |
| `HOLD_LIMIT` | 429 | Batas hold per nomor / plafon hold tercapai |
| `CAPACITY_FULL` | 422 | Porsi tanggal/jendela habis |
| `DAY_CLOSED` | 422 | Hari ditutup |
| `CUTOFF_PASSED` | 422 | Lewat cut-off |
| `MIN_ORDER_NOT_MET` | 422 | Di bawah minimal porsi per order |
| `ORDER_TOO_LARGE` | 422 | Di atas batas porsi per order (default 200) |
| `CAPACITY_RULE_VIOLATION` | 422 | Konfigurasi kapasitas melanggar aturan |
| `PAYMENT_ERROR` | 422 | Gateway gagal / nominal tidak cocok |
| `INTERNAL_ERROR` | 500 | Kesalahan server (sertakan `requestId`) |

## Health

`GET /health` (dan `/api/v1/health`):

```json
{ "status": "ok", "role": "web", "db": "ok", "time": "…", "version": "0.1.0" }
```
