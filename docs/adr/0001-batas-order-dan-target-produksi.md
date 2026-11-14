# ADR 0001 — Batas porsi per order, minimum, dan target produksi

- **Status:** Diterima (O1–O3 diputuskan 2026-11-14; lihat §4)
- **Tanggal:** 2026-11-13
- **Pemilik keputusan:** Herka
- **Sumber:** PRD System Design v2 (29 Okt 2026), `docs/prd-mapping.md` §2, `docs/api.md`, `docs/quick-reference.md`

## 1. Konteks

PRD v2 menetapkan beberapa aturan porsi yang di implementasi berubah atau diperjelas. Keputusan ini
hanya tercatat di beberapa dokumen dan sebagian bertentangan. ADR ini mencatat kondisi nyata dan
memisahkan yang sudah diputuskan dari yang masih terbuka.

## 2. Keputusan yang sudah berlaku

### D1 — Batas porsi per order default 200 (menyimpang dari PRD awal 50)

- Default `order.max_portions_per_order = 200`, dapat diubah admin lewat `PUT /admin/settings/order`.
- Order di atas batas dialihkan ke quotation (`ORDER_TOO_LARGE` → `/quote`).
- **Konsekuensi:** saat batas dinaikkan, `ensureMinimumHoldCeiling` menaikkan plafon hold hari-hari
  ke depan minimal sebesar batas itu, dibatasi `max_regular`.
- **Risiko yang diterima:** satu hold besar dapat mengunci sebagian besar kapasitas harian selama
  10 menit. Belum ada mitigasi selain plafon hold; lihat §4 butir O3.

### D2 — Minimum 50 porsi per order adalah validasi keras

- `order.min_portions = 50`, ditolak dengan `MIN_ORDER_NOT_MET` sebelum reservasi.
- Berlaku di `POST /orders` dan dijalankan di service, bukan hanya di UI.

### D3 — Target minimum produksi bukan batas checkout

- `targetMin` pada `daily_capacity` adalah indikator untuk dapur dan tidak membatasi checkout.
- Batas per order diatur terpisah dari target (D1).
- Catatan: lihat O2 untuk pertentangan dengan `prd-mapping.md` #3.

### D4 — Penerapan kapasitas mingguan

- `PUT /admin/days/week/{date}` menerapkan kapasitas, cut-off, jendela antar, dan target ke
  Senin–Minggu dalam satu transaksi.
- Menu per tanggal tidak ikut berubah.

### D5 — Menu dihapus secara soft delete

- `is_active = false`; order lama menyimpan snapshot nama dan harga.

### D6 — Pendapatan dihitung dari order lunas

- `totalRevenue` hanya menjumlahkan order `paid`/diproses. `grossOrderValue` menjumlahkan semua
  order termasuk pending dan batal.

## 3. Alasan

- **D1:** kebutuhan bisnis mengizinkan order lebih besar tanpa jalur manual. Batas yang bisa diubah
  admin menghindari perubahan kode setiap kali kapasitas dapur berubah.
- **D2:** mencegah order kecil yang tidak layak diproduksi, dan dijaga di server agar tidak bisa
  dilewati klien.
- **D3:** memisahkan kebutuhan dapur (produksi efisien) dari kebutuhan tamu (boleh pesan kecil
  jika kapasitas tersedia). Ini menghindari checkout tertahan karena target harian belum tercapai.
- **D4:** mencegah admin mengubah tujuh hari satu per satu dan lupa salah satunya.

## 4. Pertanyaan terbuka — diputuskan 2026-11-14

Ketiga butir ini sudah diputuskan. Kolom terakhir mencatat keputusannya.

| # | Pertanyaan | Bukti yang bertentangan | Keputusan |
|---|---|---|---|
| O1 | "Minimal 50" berlaku **per order** atau **per menu dalam order**? | `prd-mapping.md` #1: "minimal order 50 qty dari setiap menu". `api.md` dan D2: "minimal 50 porsi per order". | **(a) per order total.** Dokumen sudah disesuaikan. |
| O2 | Target minimum produksi: indikator (D3) atau syarat keras? | `prd-mapping.md` #3 menulis "syarat keras"; `session-summary` §4 dan `quick-reference` menulis indikator. | **(a) indikator.** D3 berlaku; `prd-mapping` #3 sudah diubah. |
| O3 | Plafon hold harus ≥ batas per order? | `api.md` menulis `ceiling ≥ maxPo` dan `holdCeiling ≤ maxRegular`, tetapi tidak menyebut batas per order. Dengan batas 200 dan plafon 100, order 150 porsi selalu ditolak `HOLD_LIMIT`. | **(a) validasi `holdCeiling ≥ min(maxPortionsPerOrder, maxRegular)`.** Ditegakkan di `updateDay`; lihat `api.md`. |

## 5. Konsekuensi dokumen

Setelah O1–O3 diputuskan, ubah:

- `docs/prd-mapping.md` §2 dan §5 (#1, #3, "Cap porsi per order 200").
- `docs/api.md` contoh `PUT /admin/days/{date}` dan validasi.
- `docs/quick-reference.md` bagian "Portions & Capacity".
- `docs/session-summary.md`: **hapus** setelah ADR ini disetujui. Seluruh keputusannya sudah tercakup di sini.

## 6. Alternatif yang ditolak

- **Tetap di `session-summary.md`:** file itu bersifat sementara dan tidak punya tanggal per butir.
- **Batas 50 sesuai PRD awal:** bertentangan dengan kebutuhan bisnis yang tercatat di D1.
- **Target minimum sebagai batas per order:** menjadikan dapur sebagai pengatur checkout, bukan
  kapasitas.

## 7. Verifikasi

Keputusan D1–D6 harus dicek terhadap kode dengan perintah berikut sebelum status diubah menjadi
"Diterima":

```bash
grep -rn "max_portions_per_order" packages/core/src | head
grep -rn "MIN_ORDER_NOT_MET" packages/core/src | head
grep -rn "ensureMinimumHoldCeiling" packages/core/src | head
```

Saya tidak menjalankan perintah ini karena hanya membaca dokumen.
