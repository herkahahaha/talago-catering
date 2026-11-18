---
language: id-ID
---

# Prioritas Go-Live: Validasi Pasar Grosir Anonim

## Problem Statement

Bagaimana cara memastikan sistem yang sudah dibangun (thin-slice v2, status per
`docs/prd-mapping.md`) benar-benar bisa membuktikan "ada yang mau bayar & repeat order" di
pasar grosir anonim skala besar — tanpa soft launch gagal diukur karena gateway/notifikasi
masih mock, atau gagal secara teknis karena bug konkurensi yang sudah terbukti di load test.

## Konteks

- Pilot dari bisnis resto nasi kotak Padang yang sudah mature (Pontianak) — bukan startup
  bermodal terbatas. Kapasitas dapur, SDM, dan modal bukan kendala.
- Model bisnis: **grosir anonim** — siapa saja boleh datang, beli jumlah besar, bayar, diantar.
  Ukuran pasar anonim sudah divalidasi lewat riset internal, bukan asumsi.
- Implementasi sudah jauh lebih maju dari sekadar ide: monorepo (`apps/web`, `apps/dashboard`,
  `apps/api`, `packages/core`), fase 1a–1d PRD v2 sudah ✅ di level thin-slice
  (`docs/prd-mapping.md`, commit `89ee83e`).
- Cap per order sudah dinaikkan dari 50 → 200 porsi (ADR 0001, D1) "sesuai permintaan bisnis" —
  sinyal bahwa permintaan di atas rata-rata itu nyata, bukan hipotetis.
- Blocker saat ini: **provider payment gateway belum dipilih**, sehingga pembayaran dan
  notifikasi (OTP, konfirmasi order) masih mock di seluruh sistem.

## Recommended Direction

Jangan masuk ke tuning performa atau fitur baru dulu. Urutannya:

1. **Prasyarat keras (blocking semua arah lain):** pilih & pasang payment gateway asli +
   minimal satu kanal notifikasi nyata (WhatsApp API untuk OTP & konfirmasi order). Tanpa ini,
   metrik sukses ("ada yang mau bayar & repeat") secara teknis tidak bisa diukur — uang tidak
   benar-benar berpindah, dan pelanggan tidak menerima konfirmasi apa pun.
2. **Paralel setelah prasyarat terpasang, prioritas tinggi & murah:**
   - Tutup loop quotation → PO (§13, baris terakhir) supaya pembeli di atas cap 200 porsi —
     justru yang paling membuktikan tesis "grosir" — tidak jatuh ke daftar admin tanpa tindak
     lanjut.
3. **Di belakang, sebelum volume nyata naik (bukan sebelum soft launch sama sekali, kecuali ada
   alasan konkret promosi besar hari-1):**
   - Perbaiki retry `order_no` collision (sudah terbukti gagal di load test 15 Nov: 3 collision
     → HTTP 500).
   - Pasang trusted-proxy config yang benar (Caddy/Cloudflare) supaya rate-limit per-IP
     (`X-Forwarded-For`) tidak trivial dilewati — relevan justru karena pasar anonim besar
     menarik bot/penimbun.

Alasan urutan ini: soft launch awal (50→100→200 porsi/hari per roadmap) kemungkinan besar masih
di bawah ambang yang memicu bug konkurensi, jadi mengejar B (hardening infra) sebelum A/C
(revenue loop) adalah salah prioritas — kecuali riset internal Anda memperkirakan lonjakan hari-1
yang signifikan (mis. promosi ke database pelanggan resto existing).

## Key Assumptions to Validate

- [ ] **Volume soft launch awal tetap terkendali** (tidak ada lonjakan hari-1 besar) — cek
  rencana marketing/promosi peluncuran sebelum menunda perbaikan `order_no`/rate-limit.
- [ ] **Order di atas cap 200 porsi memang porsi signifikan dari permintaan** — cek ulang data
  riset internal: berapa persen calon pembeli menyebut kebutuhan >200 porsi? Kalau kecil,
  turunkan prioritas item quotation→PO.
- [ ] **Provider gateway yang dipilih mendukung QRIS + VA dengan refund yang jelas biaya &
  SLA-nya** — validasi langsung ke 2–3 calon provider sebelum integrasi dimulai, karena
  `docs/prd-mapping.md` §13 sudah menandai ini sebagai belum tervalidasi.
- [ ] **Satu kanal notifikasi (WhatsApp API) cukup untuk soft launch** — konfirmasi tidak perlu
  SMTP/email sekaligus di hari pertama; validasi dengan cek apakah OTP adaptif (setelah 2 hold
  kedaluwarsa) akan sering ter-trigger di volume rendah awal.

## MVP Scope

**In:**
- Payment gateway asli terpasang (sandbox → live), menggantikan mock di
  `checkout.handlePaymentWebhook`.
- Kanal notifikasi nyata minimal: WhatsApp API untuk OTP + konfirmasi order (menggantikan outbox
  mock).
- Quotation → PO: minimal notifikasi ke admin saat ada quotation masuk + aksi manual "konversi
  ke PO" di dashboard.
- Guard produksi: tolak start `NODE_ENV=production` kalau `SESSION_SECRET`, `CAPTCHA_SECRET`,
  `PAYMENT_WEBHOOK_SECRET`, atau password admin seed masih nilai default.

**Out (untuk tahap ini):**
- Perbaikan `order_no` collision retry dan trusted-proxy/rate-limit bypass — dijadwalkan
  sebelum volume naik ke tahap 100→200 porsi/hari, bukan blocking rilis awal.
- Jendela antar wajib (keputusan #9) — tetap opsional sesuai status saat ini.
- Edge/CDN rate limiting, degradasi baca saat DB bermasalah, k6 load test formal — fase
  berikutnya setelah data soft launch nyata ada.

## Not Doing (dan Alasannya)

- **Tuning parameter anti-bot/hold-ceiling sebelum ada data nyata** — dokumen desain sendiri
  bilang ini harus disetel dari load test & observasi, bukan ditebak di muka.
- **Membangun alur PO otomatis penuh (quotation → kontrak → termin)** — cukup konversi manual
  dulu; otomasi penuh adalah fase 2, dan volume PO di atas cap belum tentu cukup besar untuk
  menjustifikasi investasi itu sekarang (lihat Key Assumptions).
- **Multi-kanal notifikasi (SMTP + WhatsApp sekaligus) di hari pertama** — satu kanal yang
  benar-benar jalan lebih baik daripada dua yang setengah jadi.
- **Mengejar k6 load test formal di hardware khusus sebelum soft launch** — berguna, tapi tidak
  memblokir validasi "ada yang mau bayar" di volume rendah awal; kejar setelah ada sinyal
  demand nyata.

## Open Questions

- Provider gateway mana yang dipilih, dan apakah mendukung QRIS + VA dengan refund yang biayanya
  jelas? (Ini blocker aktif saat ini — belum diputuskan.)
- Apakah ada rencana promosi peluncuran yang bisa memicu lonjakan hari-1 (mis. broadcast ke
  database pelanggan resto existing)? Ini menentukan apakah perbaikan `order_no`/rate-limit
  perlu naik prioritas sebelum, bukan sesudah, soft launch.
- Dari riset internal, berapa besar proporsi calon pembeli yang butuh >200 porsi/order? Ini
  menentukan urgensi menutup loop quotation → PO.
