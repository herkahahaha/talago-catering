# CLAUDE.md — playbook

Konteks domain dan aturan kerja ada di [`AGENTS.md`](AGENTS.md) dan [`docs/README.md`](docs/README.md).
File ini hanya berisi pola yang sudah terbukti di repo ini. Tambahkan bullet baru dengan bukti (kode, dokumen, atau pengamatan berulang).

## Project Context

### Storefront `apps/web` (Astro + Solid islands)
- **Islands mengandung logika**: `MenuBrowser.tsx`, `CheckoutFlow.tsx`, `OrderLookup.tsx`, `OrderStatusActions.tsx`. Untuk restyle, ubah markup dan class saja. Jangan ubah signal, handler, nama field form, atau panggilan `apiFetch`.
- **Dev tanpa backend**: jalankan `API_BASE_URL=http://127.0.0.1:3000 pnpm --filter @catering/web dev` dengan mock API di port 3000. Halaman yang memanggil `serverApi` (`/`, `/menu`, `/checkout`, `/order/[token]`) butuh endpoint `/availability`, `/menu`, `/service-area`, `/captcha`, `/orders/mine`, dan `/orders/:token`.

## Code Quality Standards

### CSP membatasi sumber font dan stylesheet
- **Pola**: `apps/web/src/middleware.ts` mengirim `style-src 'self' 'unsafe-inline'` dan `font-src 'self' data:`. Google Fonts diblokir di browser.
- **Aturan**: host font lewat paket `@fontsource-variable/*` dan import di `Layout.astro`. Jangan tambahkan `<link>` ke fonts.googleapis.com.
- **Bukti**: console error CSP pada semua halaman sebelum perbaikan.

### Shorthand CSS menimpa padding container
- **Pola**: `.container` memakai `padding-inline`. Jika `padding` ditulis shorthand pada elemen yang juga `.container`, sisi kiri dan kanan ikut hilang.
- **Aturan**: gunakan `padding-block` bila elemen juga `.container`, atau tulis `padding-inline` eksplisit.
- **Bukti**: `.page-head` menghilangkan gutter kiri-kanan. Sudah diperbaiki pada commit `88ef2b1`.

### Overflow horizontal di grid
- **Pola**: `grid-template-columns: 1fr` memakai `min-width: auto`, sehingga konten lebar (misalnya date-strip) memperlebar halaman.
- **Aturan**: pakai `minmax(0, 1fr)` pada kolom grid yang memuat konten lebar, dan `min-width: 0` pada anak grid.
- **Verifikasi**: ukur `document.documentElement.scrollWidth` pada viewport 390px. Hasil harus sama dengan `clientWidth`.

## Testing Strategies

### Verifikasi restyle di Chrome headless
- **Pola**: `/usr/bin/google-chrome` dengan `playwright.sync_api`, `args=['--no-sandbox']`, dan `executable_path` eksplisit.
- **Cek yang dijalankan**: alur menu → keranjang → checkout, console error (`pageerror` dan `console.error`), dan `scrollWidth` di 390px.
- **Ukur geometri**: gunakan `getBoundingClientRect()` untuk tinggi kartu, ukuran thumbnail, dan jumlah kolom. Jangan menilai dengan mata saja.

### Diff markup harus diuji tanpa spasi
- **Pola**: Prettier mengubah indentasi blok yang dibungkus, sehingga `git diff` terlihat besar.
- **Aturan**: gunakan `git diff -w -U0 apps/web/src/islands` untuk membuktikan bahwa hanya markup yang berubah. Cari baris `+`/`-` yang memuat `createSignal`, `onClick`, `apiFetch`, atau `setCart`.

## Development Guidelines

### Clone dangkal dan stop hook "unpushed"
- **Pola**: `git clone --depth 1 --single-branch` tidak menyimpan ref remote untuk branch lain. Hook menganggap commit yang sudah di-push sebagai belum di-push.
- **Aturan**: setelah push branch baru, jalankan `git config --add remote.origin.fetch '+refs/heads/<branch>:refs/remotes/origin/<branch>'` lalu `git branch --set-upstream-to=origin/<branch>`.
- **Verifikasi**: `git rev-list --count @{u}..HEAD` harus `0`.

### Kartu daftar menu (referensi Figma)
- **Spesifikasi**: kartu 388×150px, thumbnail 1:1 112px, padding 19/16px, radius kartu 20px, radius thumbnail 16px.
- **Lebar kolom**: `.menu-layout` memakai `minmax(0,1fr) 240px` dengan gap 24px, sehingga kolom daftar 792px dan muncul dua kartu per baris pada layar besar.
- **Pertahankan**: `.dish-desc` dibatasi 2 baris dan judul 1 baris, agar tinggi kartu tetap 150px.

## Strategies and Hard Rules

### Verification Checklist (restyle)
- [ ] Typecheck (`pnpm --filter @catering/web typecheck`), lint, dan build lolos.
- [ ] Tidak ada console error di halaman yang diubah.
- [ ] Tidak ada horizontal scroll di 390px.
- [ ] `git diff -w` pada islands tidak menyentuh signal, handler, atau API.
- [ ] Ukuran kartu diukur pada 1440, 1120, 1000, dan 390px.

### Anti-patterns
- **Menjalankan Google Fonts atau CDN eksternal** di halaman publik: diblokir CSP dan menghasilkan console error.
- **Menilai layout dari screenshot saja**: lebar kartu dan overflow harus diukur dengan `getBoundingClientRect` dan `scrollWidth`.
- **Mengganti label visual menjadi teks tersembunyi tanpa `sr-only`**: label "per porsi" dipertahankan untuk pembaca layar.

**Confidence**: High untuk bagian Code Quality dan Testing (sudah diuji di repo ini). Medium untuk aturan kartu menu (masih menunggu review desain).
**Source**: sesi restyle `feat/web-ui-revamp`, November 2026.
