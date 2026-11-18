# Implementation Plan: Menutup Loop Quotation → PO

Source spec: `docs/ideas/go-live-prioritas-pasar-grosir-anonim.md` (item MVP "quotation →
konversi ke PO di dashboard"), `docs/prd-mapping.md` §7 & §13, ADR 0001 D1.

## Overview

Saat ini permintaan quotation (order >200 porsi) masuk ke tabel `quotations`, tampil di
dashboard (`/quotations`), tapi berhenti di situ: admin tidak diberi tahu ada permintaan baru
(outbox notifikasi hanya ke pelanggan), tidak ada cara mengubah status quotation, dan tabel
`purchase_orders` — yang sudah disiapkan skemanya — tidak pernah ditulis kode apa pun. Pembeli
grosir terbesar (justru yang paling membuktikan tesis pasar "grosir anonim" di one-pager)
jatuh ke lubang hitam administratif.

Scope pekerjaan ini: (1) admin bisa mengubah status quotation (dihubungi/batal), (2) admin bisa
mengonversi quotation menjadi PO (mengisi harga disepakati + jatuh tempo), (3) admin bisa
menautkan PO itu ke order nyata lewat alur "buat order manual" yang sudah ada, dan (4) admin
mendapat notifikasi outbox saat ada quotation baru masuk, ke nomor WhatsApp yang bisa diatur.

**Tidak membangun:** alur PO otomatis penuh (kontrak, termin, approval berjenjang) — itu tetap
fase 2 sesuai one-pager. Tidak membangun menu-picker baru untuk PO; menautkan order memakai
ulang halaman `/new-order` yang sudah ada (source `po`).

## Architecture Decisions

- **Reuse `/new-order`, jangan bangun form order baru untuk PO.** Halaman ini sudah mendukung
  `source: 'po'` dan menu-picker lengkap. Menambah pre-fill via query param jauh lebih murah
  dan lebih konsisten daripada form kedua yang akan drift dari yang pertama.
- **`purchase_orders` tidak mendapat kolom status terpisah.** Keberadaan baris PO + `orderId`
  terisi atau tidak sudah cukup menyatakan keadaan ("dibuat, belum ada order" vs "sudah ada
  order"). Menambah state machine PO sendiri di tahap ini akan menduplikasi state machine order
  yang sudah ada.
- **Notifikasi admin lewat outbox yang sudah ada (`notifications`), bukan kanal baru.** Worker
  pengirim sudah berjalan; cukup menambah template dan tujuan (nomor WhatsApp admin dari
  `settings`), bukan membangun jalur I/O baru.
- **Nomor WhatsApp admin disimpan di `settings` (key-value), bukan tabel staf baru.** Pola yang
  sama persis dengan `admin.get/put('/settings/order')` yang sudah ada — konsisten dan kecil.

## Task List

### Phase 1: Status quotation bisa diubah admin

- [x] Task 1: Endpoint + UI ubah status quotation (dihubungi/batal)

### Checkpoint: Foundation
- [x] `pnpm test` & `pnpm typecheck` lulus
- [x] Admin bisa mengubah status quotation dari dashboard dan tercatat di audit log

### Phase 2: Konversi quotation → PO

- [ ] Task 2: Service `convertQuotationToPO` + nomor PO + audit
- [ ] Task 3: Endpoint `POST /admin/quotations/:id/convert`
- [ ] Task 4: Dialog konversi di dashboard + tampilkan info PO di tabel

### Checkpoint: Core — PO record
- [ ] `pnpm test` & `pnpm typecheck` lulus
- [ ] Admin bisa mengonversi quotation `won` jadi baris PO dengan nomor, harga disepakati, jatuh
      tempo, dan status quotation berubah jadi `won`

### Phase 3: Tautkan PO ke order nyata

- [ ] Task 5: Pre-fill `/new-order` dari quotation + endpoint link PO↔order
- [ ] Task 6: Tombol "Buat order" di baris quotation yang sudah jadi PO tapi belum ada order

### Checkpoint: Loop tertutup end-to-end
- [ ] `pnpm test` & `pnpm typecheck` lulus
- [ ] Manual: quotation baru → admin tandai won & konversi → klik "Buat order" → order
      PO-partition tercipta dan tertaut ke PO yang sama, terlihat di `/quotations`

### Phase 4: Notifikasi admin saat quotation baru masuk

- [ ] Task 7: Setting nomor WhatsApp admin + enqueue notifikasi saat quotation dibuat
- [ ] Task 8: Form kecil untuk mengatur nomor WhatsApp admin di dashboard

### Checkpoint: Notifikasi
- [ ] `pnpm test` & `pnpm typecheck` lulus
- [ ] Manual: quotation baru menghasilkan baris `notifications` status `queued` ke nomor admin
      yang dikonfigurasi (worker outbox tetap mock — belum mengirim keluar, sesuai status
      kanal nyata di `docs/prd-mapping.md` §13)

### Phase 5: Tes & dokumentasi

- [ ] Task 9: Tes integrasi untuk status transition, convert-to-PO, link-order
- [ ] Task 10: Perbarui `docs/prd-mapping.md` §7 & §13

### Checkpoint: Selesai
- [ ] Semua acceptance criteria terpenuhi
- [ ] `pnpm lint`, `pnpm typecheck`, `pnpm test` lulus di seluruh monorepo
- [ ] Siap direview

## Risks and Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| Admin mengonversi quotation jadi PO lalu lupa membuat order — loop "tertutup" di PO tapi tidak pernah jadi order nyata | Medium | Task 6 menampilkan status "belum ada order" tegas di tabel; tidak menganggap PO tanpa order sebagai selesai |
| Nomor WhatsApp admin kosong (belum diisi) membuat notifikasi tak pernah terkirim secara diam-diam | Low | `enqueueNotification` dilewati dengan log/skip eksplisit jika setting kosong, bukan error — dan Task 8 menaruh field itu di tempat yang terlihat admin saat pertama buka halaman quotations |
| Menambah `source: 'po'` order lewat `/new-order` yang sudah ada mengandalkan menu-picker manual — total harga order yang terbentuk bisa beda dari `agreedTotal` di PO | Medium | Didokumentasikan sebagai batasan sadar di Task 4/5 (tidak di-reconcile otomatis); fase 2 baru menyelaraskan harga PO vs order jika terbukti jadi masalah nyata |
| `purchase_orders.orderId`/`quotationId` tidak punya FK fisik eksplisit di schema saat ini (lihat `packages/core/src/modules/quotations/schema.ts`) | Low | Task 2 menambah FK lewat migrasi `0001_foreign_keys.sql`-style terpisah mengikuti konvensi repo, bukan menulis ulang migrasi lama |

## Open Questions

- Apakah PO yang sudah dikonversi tapi quotation-nya berubah jadi `lost` setelah itu perlu
  dicegah di level validasi (mis. tidak boleh convert quotation berstatus `lost`)? Diasumsikan
  ya untuk sekarang (validasi di Task 2); konfirmasi jika alur bisnisnya berbeda.
- Siapa yang menerima notifikasi admin — satu nomor WhatsApp tunggal (seperti di rencana ini)
  atau perlu per-role (admin vs sales)? Diasumsikan satu nomor cukup untuk soft launch.
