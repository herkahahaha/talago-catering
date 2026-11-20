# ADR 0004 — Tidak ada pembedaan segmen pembayaran PO; fitur klasifikasi segmen ditunda

- **Status:** Diterima
- **Tanggal:** 2026-11-20
- **Pemilik keputusan:** Herka
- **Menggantikan:** [ADR 0003](0003-batas-pembayaran-per-segmen.md) seluruhnya (S1 dan S2)
- **Berkaitan dengan:** [ADR 0002](0002-konversi-quotation-ke-po.md) (aturan pembayaran berlaku sebagaimana adanya), [ADR 0001](0001-batas-order-dan-target-produksi.md) (tidak diubah)

## 1. Konteks

ADR 0003 mengusulkan pembayaran dibedakan per segmen (swasta, pemerintah, personal), dengan fitur admin untuk menetapkan segmen. Setelah itu Herka memutuskan dua hal:

- Pesanan B2G dibuat sama dengan B2B. Pesanannya tidak akan mencapai ratusan juta, jadi tidak ada aturan khusus.
- Fitur pengaturan segmen belum dibutuhkan dan ditunda.

## 2. Keputusan

### T1 — Aturan pembayaran tunggal untuk semua segmen

- Semua PO mengikuti ADR 0002: satu PO menerbitkan satu invoice, dengan maksimal dua kali pembayaran parsial per invoice. Bukti setiap pembayaran dicatat.
- Tidak ada aturan pembayaran yang bergantung pada segmen pelanggan.

### T2 — Fitur klasifikasi segmen ditunda

- Tidak ada atribut segmen di PO/order, tidak ada input di dashboard, dan tidak ada pengaturan segmen.
- Fitur ini dibangun hanya jika ada kebutuhan nyata yang tidak bisa dipenuhi oleh T1.

## 3. Alasan

- **T1:** Nominal pesanan besar tidak mencapai ratusan juta, sehingga satu aturan cukup. Satu aturan juga lebih mudah diuji dan dijelaskan ke pelanggan.
- **T2:** Fitur segmen hanya bernilai jika ada aturan yang berbeda per segmen. Karena T1 menyeragamkan aturan, fitur itu belum punya fungsi.

## 4. Konsekuensi

- ADR 0003 ditandai digantikan. Isinya tidak dihapus, sesuai aturan histori di `agent-instructions.md`.
- Modul `payments` cukup menerapkan aturan ADR 0002. Tidak perlu membaca segmen.
- Index `purchase_orders.order_id` tetap direncanakan unik, sesuai ADR 0002.

## 5. Pemicu peninjauan ulang

Tinjau keputusan ini jika terjadi salah satu hal berikut:

- Ada pesanan yang secara nyata perlu pembayaran lebih dari dua kali, atau pembayaran bertahap yang tidak bisa ditangani aturan ini.
- Ada kebutuhan pelaporan atau aturan berbeda per jenis pelanggan.

Jika peninjauan menghasilkan keputusan baru, buat ADR baru yang merujuk ADR ini.

## 6. Amendments

Belum ada.
