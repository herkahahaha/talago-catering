# ADR 0003 — Pembayaran per segmen pelanggan PO dan klasifikasi segmen

- **Status:** Digantikan oleh [ADR 0004](0004-tanpa-pembedaan-segmen-pembayaran.md)
- **Tanggal:** 2026-11-20
- **Pemilik keputusan:** Herka
- **Menggantikan sebagian:** [ADR 0002](0002-konversi-quotation-ke-po.md) §7 Amendments 2026-11-20 (O4), khusus aturan dua kali pembayaran parsial untuk semua segmen. Bagian lain ADR 0002 tetap berlaku.
- **Berkaitan dengan:** [ADR 0001](0001-batas-order-dan-target-produksi.md) (tidak diubah)

## 1. Konteks

ADR 0002 memutuskan bahwa satu PO menerbitkan satu invoice, dan pembayaran parsial dibatasi maksimal dua kali per invoice untuk semua pelanggan.

Herka kemudian menjelaskan dua hal:

- Pesanan dari instansi pemerintah (B2G) sebaiknya dibayar **penuh sekaligus**, karena nominalnya tidak akan mencapai ratusan juta. Ini meluruskan dugaan sebelumnya bahwa B2G memerlukan pembayaran bertahap.
- Perlu fitur baru untuk **mengatur segmen** setiap order PO, dengan tiga kategori: swasta, pemerintah, dan personal (decision maker atau event planner).

## 2. Keputusan

### S1 — Aturan pembayaran dibedakan per segmen

- **B2G (pemerintah):** dibayar penuh dalam **satu kali pembayaran**. Tidak ada pembayaran parsial.
- **B2B (swasta):** mengikuti ADR 0002, yaitu maksimal dua kali pembayaran parsial per invoice.
- **Personal (decision maker atau event planner):** aturannya **belum diputuskan** (lihat §6).
- Aturan ini menggantikan butir "maksimal dua kali pembayaran per invoice" di ADR 0002 hanya untuk segmen B2G dan personal. Untuk B2B tetap berlaku.

### S2 — Segmen order PO diatur lewat fitur baru

- Setiap PO/order mendapat atribut segmen dengan tiga nilai: `swasta`, `pemerintah`, `personal`.
- Segmen ditetapkan oleh admin lewat fitur baru. Fitur ini belum dibangun.
- Aturan pembayaran di S1 membaca nilai segmen ini.
- Batas-batas aturan disimpan sebagai pengaturan (`settings`), bukan hard-code, supaya bisa disesuaikan admin.

### S3 — Setiap pembayaran tetap dicatat dengan bukti

- Berlaku untuk semua segmen, termasuk pembayaran penuh. Tidak berubah dari ADR 0002.

## 3. Alasan

- **S1:** B2G membayar penuh karena nominalnya tidak besar, sehingga pembayaran bertahap tidak diperlukan. Membedakan per segmen menjaga B2B tetap dengan batas dua kali pembayaran.
- **S2:** Aturan pembayaran tidak bisa dibedakan tanpa informasi segmen. Admin perlu menetapkannya, karena sistem tidak bisa menebaknya dari data order.

## 4. Alternatif yang ditolak

- **Batas dua kali pembayaran untuk semua segmen:** tidak sesuai dengan kebutuhan B2G yang membayar penuh.
- **Segmen ditebak dari data order atau nama pelanggan:** tidak andal, dan bisa salah klasifikasi.

## 5. Konsekuensi

- Modul `payments` perlu membaca segmen order dan aturan yang sesuai. Belum diimplementasikan.
- Fitur klasifikasi segmen perlu dibangun: field di PO/order, input di dashboard, dan audit log.
- Index `purchase_orders.order_id` tetap direncanakan unik, sesuai ADR 0002.
- Tidak ada perubahan skema di branch ini.

## 6. Pertanyaan terbuka

- **Aturan pembayaran untuk segmen personal:** penuh sekali, atau mengikuti batas B2B?
- **Detail fitur klasifikasi:** apakah segmen wajib diisi sebelum order dikonfirmasi, dan apakah bisa diubah setelah pembayaran pertama?

## 7. Verifikasi

Sebelum implementasi, cek:

```bash
grep -rn "segment\|max_payments" packages/core/src/modules/payments | head
grep -rn "order.max_portions_per_order" packages/core/src | head
```

## 8. Amendments

### 2026-11-20

- Versi awal ADR ini menyatakan bahwa B2G memerlukan batas pembayaran yang lebih longgar. Itu **tidak benar**. Herka mengklarifikasi bahwa B2G membayar penuh sekaligus, karena nominal pesanannya tidak akan mencapai ratusan juta. Bagian S1 dan §1 sudah diperbarui sesuai klarifikasi ini.
- Pilihan "segmen ditentukan lewat fitur" dan tiga nilai segmen ditambahkan berdasarkan permintaan Herka.
