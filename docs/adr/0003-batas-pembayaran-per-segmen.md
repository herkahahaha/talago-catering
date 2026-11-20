# ADR 0003 — Batas pembayaran parsial dibedakan per segmen pelanggan

- **Status:** Diterima (arah keputusan); angka batas B2G dan cara menentukan segmen masih terbuka
- **Tanggal:** 2026-11-20
- **Pemilik keputusan:** Herka
- **Menggantikan sebagian:** [ADR 0002](0002-konversi-quotation-ke-po.md) §7 Amendments 2026-11-20 (O4), khusus butir "maksimal dua kali pembayaran per invoice" untuk semua segmen. Bagian lain ADR 0002 tetap berlaku.
- **Berkaitan dengan:** [ADR 0001](0001-batas-order-dan-target-produksi.md) (tidak diubah)

## 1. Konteks

ADR 0002 memutuskan bahwa satu PO menerbitkan satu invoice, dan pembayaran parsial dibatasi maksimal dua kali per invoice. Batas dua kali itu diputuskan untuk semua pelanggan.

Setelah keputusan itu, Herka menjelaskan bahwa pesanan sangat besar belum pernah terjadi di lapangan, tetapi diperkirakan cukup sering. Kasus ini kebanyakan datang dari **B2G** (instansi pemerintah), bukan B2B. Pembayaran instansi biasanya terikat siklus anggaran dan dicairkan bertahap, sehingga batas dua kali pembayaran dapat menghambat segmen ini.

## 2. Keputusan

### S1 — Batas pembayaran parsial dibedakan per segmen

- Batas pembayaran parsial per invoice ditentukan oleh segmen pelanggan, tidak lagi satu nilai untuk semua.
- **B2B** tetap mengikuti batas maksimal dua kali pembayaran (ADR 0002).
- **B2G** memakai batas yang lebih longgar. Angka pastinya **belum ditetapkan** (lihat §6).
- Batas disimpan sebagai pengaturan (`settings`) agar bisa diubah admin tanpa perubahan kode, mengikuti pola `order.*` yang sudah ada.

### S2 — Setiap pembayaran parsial tetap dicatat dengan bukti

- Berlaku untuk semua segmen: setiap pembayaran parsial wajib punya bukti yang tercatat. Ini tidak berubah dari ADR 0002.

## 3. Alasan

- **S1:** Batas yang sama untuk semua segmen tidak cocok dengan kebutuhan instansi yang mencairkan dana bertahap. Membedakan per segmen menjaga batas ketat untuk B2B sambil tidak memblokir B2G.
- Menyimpan batas di `settings` menghindari perubahan kode setiap kali batas perlu disesuaikan, sama seperti pendekatan ADR 0001 untuk batas porsi.

## 4. Alternatif yang ditolak

- **Batas dua kali tetap untuk semua segmen:** berisiko menghambat pesanan B2G yang paling besar.
- **Tanpa batas sama sekali:** membuka ruang pembayaran parsial yang tidak terkendali untuk B2B, dan tidak sesuai dengan keputusan O4 untuk segmen itu.
- **Batas diatur per pelanggan, bukan per segmen:** lebih rumit dan belum ada kebutuhan yang menuntutnya.

## 5. Konsekuensi

- Modul `payments` perlu membaca batas dari `settings` berdasarkan segmen order. Belum diimplementasikan.
- Perlu cara menentukan segmen sebuah order. Belum diputuskan (lihat §6).
- Index `purchase_orders.order_id` tetap direncanakan unik, sesuai ADR 0002. Keputusan ini tidak mengubahnya.
- Tidak ada perubahan skema di branch ini.

## 6. Pertanyaan terbuka

- **Angka batas B2G:** tanpa batas, atau batas tertentu (berapa kali pembayaran)?
- **Cara menentukan segmen:** dari jenis pelanggan (akun instansi), dari kolom pada order, atau dari kode quotation?

## 7. Verifikasi

Sebelum implementasi, cek:

```bash
grep -rn "max_payments\|partial" packages/core/src/modules/payments | head
grep -rn "order.max_portions_per_order" packages/core/src | head
```

## 8. Amendments

Belum ada.
