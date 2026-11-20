# ADR 0002 — Konversi quotation ke PO, partisi PO, dan notifikasi admin

- **Status:** Diterima
- **Tanggal:** 2026-11-20
- **Pemilik keputusan:** Herka
- **Sumber:** `tasks/plan.md` dan `tasks/todo.md` (branch `docs/plan-quotation-to-po`), `docs/architecture.md` §reservasi, `packages/core/src/modules/capacity/reserve.ts`, `packages/core/drizzle/0002_purchase_order_links.sql`
- **Berkaitan dengan:** [ADR 0001](0001-batas-order-dan-target-produksi.md) (tidak menggantikan)

## 1. Konteks

Order di atas batas 200 porsi dialihkan ke quotation (ADR 0001 D1). Sampai sebelum branch ini, quotation berhenti di tabel `quotations` dan dashboard `/quotations`:

- Admin tidak diberi tahu saat quotation baru masuk. Outbox `notifications` hanya melayani pelanggan.
- Status quotation tidak bisa diubah dari dashboard.
- Tabel `purchase_orders` sudah punya skema, tetapi tidak ada kode yang menulisnya.

Pembeli grosir terbesar, yang paling mendukung tesis pasar di one-pager, jatuh ke celah administratif ini. Branch ini menutup loop quotation → PO → order nyata. Alur PO otomatis penuh (kontrak, termin, approval berjenjang) tetap fase 2 dan tidak termasuk dalam keputusan ini.

## 2. Keputusan

### P1 — PO dialokasikan di partisi `po` dengan plafon `max_po`

- Order yang lahir dari PO memakai partisi `po` di `daily_capacity` (kolom `reserved_po`, `held_po`, `max_po`).
- Untuk partisi `po`, syarat hold memakai `max_po` sebagai plafon, bukan `hold_ceiling`. Partisi reguler tetap memakai `hold_ceiling`.
- Implementasi: fungsi `holdCeilingSql` di `capacity/reserve.ts`, dan cabang `diagnoseReserveFailure` yang sejalan.
- **Konsekuensi:** `docs/architecture.md` diperbarui. Invarian "held ≤ hold_ceiling" sekarang hanya berlaku untuk partisi reguler.

### P2 — PO tidak punya kolom status sendiri

- Keadaan PO ditentukan oleh keberadaan `order_id`. Tanpa `order_id`, PO berstatus "belum ada order". Dengan `order_id`, PO berstatus "sudah ada order".
- `purchase_orders.quotation_id` memakai unique index, sehingga satu quotation hanya menghasilkan satu PO.
- `purchase_orders.order_id` memakai index biasa, bukan unique. Keputusan ini mengikuti kode yang ada saat ini. Lihat §5.

### P3 — Order dari PO dibuat lewat `/new-order` yang sudah ada

- Halaman `/new-order` dengan `source: 'po'` dan menu-picker yang ada dipakai ulang. Quotation hanya mengisi data awal (pre-fill) lewat query param.
- Tidak ada form order PO kedua.

### P4 — Notifikasi admin lewat outbox yang sudah ada

- Notifikasi quotation masuk memakai tabel `notifications` dan worker outbox yang sudah berjalan. Tidak ada kanal I/O baru.
- Nomor WhatsApp admin disimpan di `settings` dengan key `notifications.admin_whatsapp`, mengikuti pola `order.*` yang sudah ada.
- Nilai kosong berarti notifikasi dimatikan. Ini dicatat di log, bukan dianggap error.

## 3. Alasan

- **P1:** PO adalah pesanan besar yang dibuat admin, bukan slot web. Hold anti-bot di partisi reguler tidak boleh menolak PO besar, padahal kuota PO pada tanggal itu sudah dinaikkan admin. Plafon `max_po` sudah cukup sebagai pengaman.
- **P2:** State machine PO sendiri akan menduplikasi state machine order. Keberadaan `order_id` sudah cukup untuk membedakan dua keadaan yang dibutuhkan dashboard.
- **P3:** Form kedua akan cepat berbeda dari form pertama. Pre-fill lebih murah dan lebih konsisten.
- **P4:** Worker outbox sudah ada dan teruji. Menambah kanal baru hanya menambah titik kegagalan.

## 4. Alternatif yang ditolak

- **Kolom `status` pada `purchase_orders`:** menduplikasi state machine order di tahap yang belum membutuhkannya.
- **Form PO terpisah dari `/new-order`:** drift dengan form order yang sudah ada.
- **Tabel staf atau tabel kontak admin baru:** berlebihan untuk satu nomor pada soft launch.
- **Partisi PO memakai `hold_ceiling` reguler:** menolak PO besar meski kuota PO sudah dinaikkan.

## 5. Konsekuensi dan risiko

Risiko berikut dicatat dari `tasks/plan.md` dan dari pemeriksaan kode saat ADR ini ditulis:

- **PO tanpa order bisa terlihat seperti selesai.** Mitigasi: dashboard menampilkan status "belum ada order" secara tegas (Task 6).
- **Harga PO dan total order bisa berbeda.** `agreedTotal` di PO tidak direkonsiliasi otomatis dengan total order dari menu-picker. Ini batasan yang diterima untuk sekarang. Penyelarasan ditunda sampai terbukti menjadi masalah nyata.
- **Foreign key sudah ada dan sudah dideklarasikan di Drizzle.** `0001_foreign_keys.sql` mendefinisikan `purchase_orders_quotation_fk` (ON DELETE SET NULL) dan `purchase_orders_order_fk` (ON DELETE SET NULL). Sejak 2026-11-20, `quotations/schema.ts` memakai `foreignKey()` dengan nama constraint yang sama, sehingga definisi di kode dan di database selaras (lihat Amendments).
- **Index `purchase_orders.order_id` sudah unik (O4, lihat Amendments 2026-11-20).** `link-order` sudah menolak jika PO punya `orderId`. Index unik `purchase_orders_order_uq` diimplementasikan lewat migrasi `0003_purchase_order_order_uq.sql` (2026-11-20). Aturan dua pembayaran parsial + bukti sudah tersedia di `recordPartialPayment` (2026-11-20); alur pelunasan order masih menyusul.
- **Nomor WhatsApp kosong membuat notifikasi tidak terkirim tanpa peringatan keras.** Mitigasi: field pengaturan tampil di halaman `/quotations`.
- **Uji QA manual di browser** sudah dilakukan oleh Herka dan hasilnya sebagian besar berfungsi. Checkpoint "loop tertutup end-to-end" di `plan.md` bisa dicentang. Temuan yang belum berfungsi sempurna perlu dicatat terpisah.
- **Hubungan dengan ADR 0001.** Plafon hold reguler dan validasi O3 di ADR 0001 tetap berlaku untuk partisi reguler. P1 mengecualikan partisi PO dari aturan itu. ADR 0001 tidak diubah, karena keputusan ini menambah aturan untuk partisi lain dan tidak membatalkan keputusan sebelumnya.

## 6. Verifikasi

Keputusan P1–P4 harus dicek terhadap kode sebelum branch di-merge:

```bash
grep -rn "holdCeilingSql\|max_po" packages/core/src/modules/capacity | head
grep -rn "quotation_id\|purchase_orders_quotation_uq" packages/core/drizzle packages/core/src | head
grep -rn "notifications.admin_whatsapp" packages/core/src | head
```

## 7. Amendments

### 2026-11-20 — O4 diputuskan

Butir O4: apakah satu PO boleh menerbitkan lebih dari satu invoice, dan apakah satu PO boleh tertaut ke lebih dari satu order.

**Keputusan (dari pemilik keputusan, Herka):**

- **Satu PO hanya menerbitkan satu invoice**, sehingga satu PO tertaut ke **satu order**. Usulan awal dari marketing (dua invoice per PO) **dibatalkan**.
- **Pembayaran parsial diperbolehkan**, dengan **maksimal dua kali pembayaran** per invoice (per order). Bukti tiap pembayaran dicatat.

**Konsekuensi:**

- Index unik `purchase_orders_order_uq` sudah diterapkan lewat migrasi `0003`, menggantikan `purchase_orders_order_idx`.
- Batas dua pembayaran parsial sudah diterapkan di `payments/service.ts` (`MAX_PARTIAL_PAYMENTS_PER_ORDER`). Pengecekan dan penyimpanan berjalan dalam transaksi dengan kunci baris `orders` (`FOR UPDATE`), dan ada tes integrasi untuk kasus bersamaan.
- Alasan tidak mengubah P1–P4: keputusan ini menyempitkan relasi PO–order, tidak mengubah partisi, status PO, atau jalur notifikasi.
- Data lapangan untuk pembayaran parsial belum ada. Batas dua kali pembayaran berasal dari keputusan bisnis, bukan dari data. Jika data nanti menunjukkan batas itu perlu berubah, buat ADR baru yang merujuk ADR ini.
- **Konteks segmen (dicatat 2026-11-20):** Herka menyatakan kasus pesanan sangat besar belum pernah terjadi di lapangan, tetapi diperkirakan cukup sering, dan kebanyakan datang dari **B2G** (instansi pemerintah) dibanding B2B. Pembayaran instansi biasanya terikat siklus anggaran dan dicairkan bertahap, sehingga batas dua pembayaran berpotensi terlalu ketat untuk segmen ini. Catatan ini sudah **tidak berlaku**: Herka kemudian memutuskan B2G dibayar penuh dan disamakan dengan B2B, lihat [ADR 0004](0004-tanpa-pembedaan-segmen-pembayaran.md).

### 2026-11-20 — Implementasi index unik `order_id`

Konsekuensi O4 sudah direalisasikan: skema Drizzle memakai `uniqueIndex('purchase_orders_order_uq').on(t.orderId)` dan migrasi baru `0003_purchase_order_order_uq.sql` menghapus `purchase_orders_order_idx` lalu membuat index unik. Alasan: mengunci relasi satu PO–satu order di level database setelah O4 diputuskan, sesuai keputusan 1 PO = 1 invoice. Ini bukan keputusan baru dan tidak mengubah P1–P4; migrasi baru dipakai sesuai `AGENTS.md`, migrasi lama tidak disunting.

### 2026-11-20 — Aturan pembayaran parsial di modul payments

Konsekuensi O4 untuk pembayaran parsial direalisasikan di `recordPartialPayment` (`packages/core/src/modules/payments/service.ts`): maksimal `MAX_PARTIAL_PAYMENTS_PER_ORDER = 2` pembayaran bertanda `kind: 'partial'` per order, bukti wajib diisi dan disimpan di `payload` jsonb — tanpa kolom atau migrasi baru. Ditutup oleh `packages/core/tests/integration/payments.test.ts`. Alasan: Herka memprioritaskan aturan ini di atas fitur segmen (ADR 0004 T2). Ini bukan keputusan baru dan tidak mengubah P1–P4. Alur webhook/order belum mengonsumsi pembayaran parsial, jadi status order belum berubah saat pembayaran parsial dicatat.

### 2026-11-20 — Deklarasi FK `purchase_orders` di Drizzle

`quotations/schema.ts` sekarang mendeklarasikan `purchase_orders_quotation_fk` dan `purchase_orders_order_fk` lewat `foreignKey()` dengan `ON DELETE SET NULL`, memakai nama constraint yang sama dengan `0001_foreign_keys.sql`. Tabel `orders` diimpor lewat pintu publik `../orders/index` sebagai `ordersTable` agar batas modul tetap terjaga. Migrasi `0004_purchase_order_fk_declarations.sql` memakai `DROP CONSTRAINT IF EXISTS` sebelum `ADD` supaya aman di database yang sudah memiliki FK. Alasan: menyelaraskan deklarasi Drizzle dengan FK fisik yang sudah ada; bukan keputusan arsitektur baru dan tidak mengubah P1–P4.
