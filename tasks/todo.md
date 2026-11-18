# Todo: Menutup Loop Quotation → PO

Plan lengkap: `tasks/plan.md`. Urutan fase wajib diikuti (bottom-up dependency); checkpoint
wajib hijau sebelum lanjut fase berikutnya.

---

## Task 1: Endpoint + UI ubah status quotation (dihubungi/batal)

**Description:** Admin bisa mengubah status quotation dari `new` ke `contacted` atau `lost`
lewat dashboard, dengan jejak audit. Ini prasyarat sebelum konversi ke PO (Task 2) karena
konversi sebaiknya hanya berlaku dari status yang valid.

**Acceptance criteria:**
- [x] `PATCH /admin/quotations/:id/status` menerima `{ status: 'contacted' | 'lost' }`, menolak
      transisi dari status final (`won` *atau* `lost`) dengan `INVALID_STATE` — lebih ketat dari
      rencana awal (hanya `won`), karena `lost` juga harus final
- [x] Setiap perubahan status tercatat di `audit_log` (entity `quotation`, action
      `quotation_status_changed`, before/after status)
- [x] Dashboard `/quotations` menampilkan tombol aksi "Tandai dihubungi" / "Batalkan" untuk
      quotation berstatus `new`/`contacted`. Catatan: implementasi memakai invalidate +
      refetch (pola yang sama dengan `/refunds`), bukan optimistic update — cukup untuk
      volume quotation yang rendah di soft launch

**Verification:**
- [x] Tes lulus: `pnpm --filter @catering/core test:all` (48 lulus, termasuk 4 tes baru di
      `tests/integration/quotations.test.ts`)
- [x] Build: `pnpm typecheck` (5 paket) + `pnpm --filter @catering/dashboard build`
- [x] Manual: verifikasi lewat `curl` ke API (bukan browser) — quotation baru → `contacted` →
      `lost` → percobaan ubah lagi ditolak `INVALID_STATE`, sesuai skenario tes

**Dependencies:** None

**Files likely touched:**
- `packages/contracts/src/schemas.ts` (tambah `adminQuotationStatusSchema`)
- `packages/core/src/modules/quotations/service.ts` (tambah `updateQuotationStatus`)
- `apps/api/src/routes/admin.ts` (tambah route)
- `apps/dashboard/src/routes/quotations.tsx` (tombol aksi + mutation)

**Estimated scope:** Medium (4 files)

---

## Task 2: Service `convertQuotationToPO` + nomor PO + audit

**Description:** Fungsi service yang mengubah status quotation jadi `won` dan menulis satu
baris ke `purchase_orders` (nomor PO, `agreedTotal`, `dueAt` opsional), dengan FK fisik ke
`quotations.id` ditambahkan lewat migrasi terpisah mengikuti konvensi `0001_foreign_keys.sql`.

**Acceptance criteria:**
- [ ] `makePoNo(serviceDate)` di `packages/core/src/lib/ids.ts` menghasilkan format `PO-YYMMDD-XXXX`
      (pola sama dengan `makeQuoteNo`)
- [ ] `convertQuotationToPO(exec, quotationId, input)` menolak jika quotation berstatus `lost`
      atau sudah punya baris `purchase_orders` (tidak boleh dobel) → `INVALID_STATE`
- [ ] Transaksi tunggal: update `quotations.status = 'won'` + insert `purchase_orders` (gagal
      salah satu → rollback keduanya)
- [ ] Audit tercatat: entity `quotation`, action `quotation_converted_to_po`, after berisi
      `poNumber`, `agreedTotal`
- [ ] Migrasi baru menambah FK `purchase_orders.quotation_id → quotations.id` dan
      `purchase_orders.order_id → orders.id` (nullable, `ON DELETE SET NULL`)

**Verification:**
- [ ] Tes lulus: `pnpm --filter @catering/core test`
- [ ] `pnpm db:generate` menghasilkan migrasi bersih tanpa mengubah migrasi lama
- [ ] Build: `pnpm typecheck`

**Dependencies:** Task 1 (status `won`/`lost` sudah bisa diubah; convert butuh validasi status)

**Files likely touched:**
- `packages/core/src/lib/ids.ts`
- `packages/core/src/modules/quotations/service.ts`
- `packages/core/src/modules/quotations/schema.ts` (jika perlu index tambahan)
- `packages/core/drizzle/<migrasi baru>.sql`

**Estimated scope:** Medium (4 files)

---

## Task 3: Endpoint `POST /admin/quotations/:id/convert`

**Description:** Ekspos `convertQuotationToPO` lewat API admin, dengan validasi input Zod.

**Acceptance criteria:**
- [ ] `POST /admin/quotations/:id/convert` menerima `{ agreedTotal: number, dueAt?: string }`,
      balas `201` dengan data PO (`poNumber`, `agreedTotal`, `dueAt`, `orderId: null`)
- [ ] Role admin saja (`assertRole(staff.user, ['admin'])`), sama seperti endpoint quotation
      lain
- [ ] `GET /admin/quotations` memuat info PO terkait (join sederhana) agar dashboard tahu mana
      yang sudah dikonversi tanpa request tambahan

**Verification:**
- [ ] Tes lulus: `pnpm --filter @catering/core test` + tes rute di `apps/api` jika ada harness-nya
- [ ] Build: `pnpm typecheck`
- [ ] Manual: `curl`/Postman ke endpoint dengan token staff admin

**Dependencies:** Task 2

**Files likely touched:**
- `packages/contracts/src/schemas.ts` (`convertQuotationSchema`)
- `packages/contracts/src/dto.ts` (tambah field PO ke `QuoteRequestDto` atau DTO baru)
- `packages/core/src/modules/quotations/service.ts` (`listQuotations` join PO)
- `apps/api/src/routes/admin.ts`

**Estimated scope:** Small-Medium (4 files)

---

## Task 4: Dialog konversi di dashboard + tampilkan info PO di tabel

**Description:** Di `/quotations`, quotation berstatus `contacted` dapat tombol "Konversi ke
PO" yang membuka dialog isi `agreedTotal` + `dueAt`. Setelah konversi, baris tabel menampilkan
nomor PO dan status "belum ada order" / "order: <nomor>".

**Acceptance criteria:**
- [ ] Dialog memvalidasi `agreedTotal > 0` sebelum submit, menampilkan error dari API jika ada
- [ ] Setelah sukses, badge status berubah jadi `won` dan kolom baru menampilkan nomor PO
- [ ] Baris dengan PO tapi tanpa order tertaut menampilkan indikator berbeda dari baris yang
      sudah ada order (disiapkan untuk Task 6)

**Verification:**
- [ ] Build: `pnpm --filter @catering/dashboard build`
- [ ] Manual: konversi satu quotation `contacted`, cek tampilan tabel berubah tanpa reload

**Dependencies:** Task 3

**Files likely touched:**
- `apps/dashboard/src/routes/quotations.tsx`
- komponen dialog baru di `apps/dashboard/src/components/` jika dialog generik belum ada

**Estimated scope:** Medium (2-3 files)

---

## Task 5: Pre-fill `/new-order` dari quotation + endpoint link PO↔order

**Description:** `/new-order` menerima query param `quotationId`; jika ada, pre-fill
nama/telepon/email/tanggal/catatan dari quotation dan paksa `source = 'po'`. Setelah order
berhasil dibuat, panggil endpoint baru untuk menautkan `orderId` ke baris `purchase_orders`
yang sesuai.

**Acceptance criteria:**
- [ ] `PATCH /admin/purchase-orders/:id/link-order` menerima `{ orderId }`, menolak jika PO
      sudah punya `orderId` lain (tidak overwrite diam-diam) → `INVALID_STATE`
- [ ] `/new-order?quotationId=<id>` pre-fill field dari data quotation (fetch
      `GET /admin/quotations/:id` atau reuse data list yang sudah di-cache)
- [ ] Setelah order berhasil dibuat dari konteks ini, link-order dipanggil otomatis dan user
      diarahkan kembali ke `/quotations` dengan toast sukses

**Verification:**
- [ ] Tes lulus: `pnpm --filter @catering/core test`
- [ ] Build: `pnpm typecheck` + `pnpm --filter @catering/dashboard build`
- [ ] Manual: dari quotation yang sudah PO, buat order baru lewat alur ini, cek
      `purchase_orders.order_id` terisi

**Dependencies:** Task 2, Task 4

**Files likely touched:**
- `packages/core/src/modules/quotations/service.ts` (`linkPurchaseOrderToOrder`)
- `apps/api/src/routes/admin.ts`
- `apps/dashboard/src/routes/new-order.tsx` (search params + prefill + post-submit link)

**Estimated scope:** Medium (3 files)

---

## Task 6: Tombol "Buat order" di baris quotation yang sudah jadi PO tapi belum ada order

**Description:** Di `/quotations`, baris dengan PO tanpa `orderId` mendapat tombol/link
`/new-order?quotationId=<id>`. Baris dengan PO yang sudah ada `orderId` menampilkan link ke
`/orders/:orderId` sebagai gantinya.

**Acceptance criteria:**
- [ ] Tombol "Buat order" hanya muncul untuk PO tanpa order tertaut
- [ ] PO dengan order tertaut menampilkan link ke halaman detail order tersebut

**Verification:**
- [ ] Build: `pnpm --filter @catering/dashboard build`
- [ ] Manual: ikuti satu quotation dari `new` → `contacted` → konversi → "Buat order" → cek
      baris berubah jadi link ke order

**Dependencies:** Task 5

**Files likely touched:**
- `apps/dashboard/src/routes/quotations.tsx`

**Estimated scope:** Small (1 file)

---

## Task 7: Setting nomor WhatsApp admin + enqueue notifikasi saat quotation dibuat

**Description:** Tambah key `notifications.admin_whatsapp` ke `settings` (default string
kosong), endpoint get/put mengikuti pola `admin/settings/order`, dan `createQuotationRequest`
mengenqueue notifikasi WhatsApp ke nomor itu (template baru `quotation_requested_admin`) —
dilewati (skip, bukan error) jika nomor belum diisi.

**Acceptance criteria:**
- [ ] `GET /admin/settings/notifications` & `PUT /admin/settings/notifications` bekerja sama
      seperti pola `settings/order` yang sudah ada
- [ ] `NotificationTemplate` di `packages/core/src/modules/notifications/service.ts` menambah
      `'quotation_requested_admin'`
- [ ] Saat quotation baru dibuat dan setting nomor admin terisi, satu baris baru muncul di
      tabel `notifications` dengan `channel: 'whatsapp'`, `recipient` = nomor admin,
      `status: 'queued'`
- [ ] Saat setting nomor admin kosong, tidak ada baris notifikasi admin yang dibuat (tidak
      error, tidak membuat baris dengan recipient kosong)

**Verification:**
- [ ] Tes lulus: `pnpm --filter @catering/core test`
- [ ] Build: `pnpm typecheck`
- [ ] Manual: isi setting, buat quotation baru via `POST /quotes`, cek tabel `notifications`

**Dependencies:** None (independen dari Phase 2–3, bisa paralel setelah Task 1 selesai)

**Files likely touched:**
- `packages/core/src/modules/settings/service.ts` (default key baru)
- `packages/core/src/modules/notifications/service.ts` (tambah template)
- `packages/core/src/modules/quotations/service.ts` (enqueue ke admin)
- `apps/api/src/routes/admin.ts`
- `packages/contracts/src/schemas.ts`

**Estimated scope:** Medium (5 files — jika melebihi, pisah endpoint settings dari enqueue jadi
dua task)

---

## Task 8: Form kecil untuk mengatur nomor WhatsApp admin di dashboard

**Description:** Field input nomor WhatsApp admin + tombol simpan, ditaruh di header halaman
`/quotations` (bukan halaman settings terpisah — scope kecil, konteksnya langsung relevan di
situ).

**Acceptance criteria:**
- [ ] Field menampilkan nilai tersimpan saat halaman dibuka
- [ ] Simpan berhasil menampilkan toast konfirmasi; gagal menampilkan pesan error dari API

**Verification:**
- [ ] Build: `pnpm --filter @catering/dashboard build`
- [ ] Manual: ubah nomor, reload halaman, nilai baru tetap tersimpan

**Dependencies:** Task 7

**Files likely touched:**
- `apps/dashboard/src/routes/quotations.tsx`

**Estimated scope:** Small (1 file)

---

## Task 9: Tes integrasi untuk status transition, convert-to-PO, link-order

**Description:** Tes integrasi di `packages/core/tests` menutupi jalur utama dan jalur
penolakan (status `lost` tidak bisa dikonversi, PO tidak bisa dobel, link-order tidak bisa
overwrite).

**Acceptance criteria:**
- [ ] Tes: quotation `new` → `contacted` → `won` (convert) → link order, semua status & FK
      sesuai ekspektasi di tiap langkah
- [ ] Tes: convert quotation `lost` ditolak `INVALID_STATE`
- [ ] Tes: convert quotation yang sudah punya PO ditolak `INVALID_STATE`
- [ ] Tes: link-order ke PO yang sudah punya `orderId` lain ditolak `INVALID_STATE`
- [ ] Tes: `createQuotationRequest` meng-enqueue notifikasi admin hanya jika setting terisi

**Verification:**
- [ ] `pnpm --filter @catering/core test` lulus, termasuk tes baru ini
- [ ] Tidak menurunkan cakupan tes yang sudah ada

**Dependencies:** Task 1, 2, 5, 7

**Files likely touched:**
- `packages/core/tests/quotations.test.ts` (baru)

**Estimated scope:** Medium (1 file, tapi beberapa skenario)

---

## Task 10: Perbarui `docs/prd-mapping.md` §7 & §13

**Description:** Catat status baru `purchase_orders` (dipakai, bukan lagi "belum dipakai kode")
dan hapus/koreksi baris risiko terkait "alur quotation → PO belum ada" di §13.

**Acceptance criteria:**
- [ ] §7 baris `quotations, purchase_orders`: hapus catatan "`purchase_orders` belum dipakai
      kode", tambahkan status baru (✅/🟡 sesuai kenyataan — konversi manual ada, approval
      berjenjang belum)
- [ ] §13 baris terakhir ("Alur quotation → PO belum ada...") diperbarui atau dihapus sesuai
      kondisi setelah Task 1–9 selesai
- [ ] Baris "Terakhir ditinjau terhadap commit" di atas tabel diperbarui ke commit hasil kerja
      ini

**Verification:**
- [ ] `pnpm check:docs` lulus (jika memeriksa referensi ini)
- [ ] Review manual: baca ulang §7 & §13, pastikan tidak ada klaim yang melebihi kode nyata

**Dependencies:** Task 1–9 (dokumentasi mengikuti kode, bukan sebaliknya)

**Files likely touched:**
- `docs/prd-mapping.md`

**Estimated scope:** Small (1 file)
