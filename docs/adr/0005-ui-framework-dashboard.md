# ADR 0005 — UI framework dashboard: Ark UI menggantikan Kobalte

- **Status:** Diterima
- **Tanggal:** 2026-11-24
- **Pemilik keputusan:** Herka
- **Sumber:** Branch `style/dashboard-ark-ui-theme`, PR #12
- **Berkaitan dengan:** —

## 1. Konteks

Dashboard awal memakai **Kobalte** sebagai primitif headless untuk komponen interaktif (Select, Dialog, Checkbox, dll.). Keputusan ini diambil sebelum Ark UI memiliki dukungan solid yang stabil. Kobalte sudah tidak aktif dikembangkan, tidak memiliki komponen DatePicker, dan tidak mendukung tema terang/gelap bawaan.

Kebutuhan yang belum terpenuhi saat itu:

- Input tanggal dan jam (DatePicker, DateInput) untuk form order, pengaturan hari, dan konversi quotation ke PO.
- Tema terang/gelap dengan toggle dan persistensi.
- Komponen yang selaras dengan design language shadcn/ui.

Radix Themes (React-only) dievaluasi tetapi langsung ditolak karena tidak kompatibel dengan SolidJS.

## 2. Keputusan

Dashboard `apps/dashboard` memakai **Ark UI** (`@ark-ui/solid`) sebagai satu-satunya pustaka primitif headless, dengan wrapper komponen di `src/components/ui/` yang membawa styling Tailwind v4 dan token shadcn/ui (design language, bukan paket npm).

Komponen yang sebelumnya dari Kobalte (Select, Dialog, Checkbox, Menu) ditulis ulang di atas Ark UI. Komponen tanggal/jam baru (DatePicker, DateTimeInput) juga menggunakan Ark UI.

## 3. Alasan

| Dimensi | Ark UI |
| :-- | :-- |
| Dukungan SolidJS | Resmi; `@ark-ui/solid` dipublikasikan bersama paket React dan Vue |
| DatePicker | Ada; berbasis `@internationalized/date` |
| DateInput (segmen) | Ada; `@ark-ui/solid/date-input` |
| Aktif dikembangkan | Ya; versi 5.x stabil saat keputusan diambil |
| Styling | Headless; styling 100% di tangan kita (Tailwind) |
| Focus trap / aksesibilitas | Ark memakai zag.js — focus trap, ARIA, keyboard sudah bawaan |

## 4. Alternatif yang ditolak

- **Kobalte (lanjutkan):** Tidak ada DatePicker, perkembangan lambat.
- **Radix Themes:** React-only; tidak bisa dipakai di SolidJS.
- **Tanpa primitif headless (komponen custom penuh):** DatePicker dan focus management aksesibel sangat kompleks untuk ditulis dari nol.
- **Mantine (SolidJS port tidak resmi):** Port komunitas, tidak stabil.

## 5. Konsekuensi

- Versi saat diterima: `@ark-ui/solid` 5.40.1 di atas `zag.js` 1.49.0.
- Semua komponen UI interaktif di `src/components/ui/` adalah wrapper Ark UI; tidak ada Kobalte tersisa.
- Styling sepenuhnya lewat Tailwind v4 + token shadcn/ui di `app.css`.
- **Konflik focus trap:** Ark Dialog dan Ark DateInput (via `DateTimeInput`) sama-sama memakai zag.js state machine. Ketika `DateTimeInput` dirender di dalam `ArkDialog.Content`, focus trap dialog mengintervensi key event segmen sehingga input jam tidak bisa diketik. Keputusan mitigasi: lihat §6.
- Komponen baru yang membutuhkan interaksi kompleks harus menggunakan primitif Ark UI; tidak diperbolehkan menambah pustaka headless lain tanpa ADR baru.

## 6. Mitigasi konflik focus trap Ark Dialog × Ark DateInput

Ditemukan saat mengembangkan popup "Konversi ke PO" (branch `style/dashboard-ark-ui-theme`, commit `00bb61b`).

**Masalah:** `DateTimeInput` (Ark DateInput + SegmentGroup) di dalam `ArkDialog.Content` tidak bisa menerima input keyboard. Focus trap zag.js di Dialog mencegat key event sebelum sampai ke segmen DateInput.

**Keputusan:** Untuk field jam di dalam popup DatePicker (`withTime={true}`), ganti `DateTimeInput` dengan `<input type="time">` native. Input native tidak punya state machine zag.js sehingga bebas dari konflik.

**Ruang lingkup keputusan ini terbatas pada:**
- Field jam di dalam popup `DatePicker` (`withTime` mode).
- Situasi serupa di masa depan: Ark DateInput **tidak boleh** dirender di dalam `ArkDialog.Content`.

**Tidak berlaku untuk:**
- `DateTimeInput` yang dirender di luar dialog (contoh: field cut-off di halaman pengaturan hari) — tetap memakai Ark DateInput dan berfungsi normal.

## 7. Verifikasi

```bash
pnpm --filter @catering/dashboard typecheck
pnpm --filter @catering/dashboard build
```

Uji manual: DatePicker `withTime` di popup dialog (kalender muncul, tanggal bisa dipilih, field jam bisa diketik, popup tidak tertutup saat mengedit jam).
