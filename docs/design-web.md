# DESIGN.md — Storefront (`apps/web`), Fase 1: Fondasi Tailwind

*Versi 1.1 • 2026-11-13 • Status: siap dikerjakan • Estimasi: ≤ 2 jam*

> **Cakupan dokumen ini.** Menggantikan §1, §3–§4, Fase 1 di §8, dan gerbang Fase 1 di §10 dari
> `design-web.md` v1.0. Bagian lain v1.0 (spesifikasi komponen §5, migrasi island §6, Fase 2–5)
> berstatus **draft**: jangan dijadikan acuan implementasi sebelum ditulis ulang (lihat §6).

---

## 1. Tujuan dan batas

**Tujuan:** utilitas Tailwind dengan warna brand bisa dipakai di `apps/web`, **tanpa mengubah
tampilan satu piksel pun**.

**Bukan tujuan Fase 1:** token Material Design, komponen, migrasi kelas legacy, dark mode, RTL,
perubahan breakpoint/tipografi/bayangan.

**Selesai bila:**

1. Utilitas warna brand (`bg-ink`, `text-cream`, …) tersedia.
2. Screenshot 5 halaman × 2 lebar identik sebelum vs sesudah.
3. `pnpm lint`, `typecheck`, `build`, `test` hijau.
4. Perubahan masuk satu commit kecil yang bisa di-revert utuh.

Fase 1 hanya **menambah** custom property dan utilitas yang belum dipakai siapa pun. Selector legacy
tidak berubah, jadi efek tampilan nol secara konstruksi. Verifikasi di §4 hanya memastikan
konstruksi itu benar.

---

## 2. Keputusan (berubah dari v1.0)

| Keputusan | Alasan |
| :-- | :-- |
| **Tanpa Preflight**: impor `theme.css` + `utilities.css`, bukan `tailwindcss` penuh | Preflight mereset heading, button, img, border. Itu mengubah 984 baris CSS legacy yang sudah punya reset sendiri. |
| **Urutan layer ditetapkan sekali**: `theme, reset, base, components, utilities` | Utilitas menang atas kelas legacy tanpa `!important`; `global.css` tidak perlu diedit. |
| **`global.css` tidak disentuh** | Token tetap punya satu sumber (`:root` legacy) sampai Fase 5. Tidak ada nilai ganda yang bisa berselisih. |
| **Hanya warna**, dipetakan 1:1 ke variabel legacy | Alias semantik (`primary`, `surface`, …) berarti menebak. Ditunda sampai komponen pertama (Fase 3). |
| **Palet bawaan Tailwind dikosongkan** | Mencegah warna di luar brand masuk lewat `bg-blue-500`. |
| **Tanpa awalan `--md-sys-*` dan tanpa `tokens.css`** | Nilai v1.0 bukan nilai M3 asli (mis. radius `large` 28px; di M3 itu `extra-large`), jadi labelnya menyesatkan. File token baru juga menggandakan `:root` yang sudah ada. |
| **Tidak memasang** `tw-animate-css`, `class-variance-authority`, `clsx`, `tailwind-merge` | Belum ada pemakai. Dipasang di Fase 3 bersama komponen pertama. |
| **Tidak mengubah breakpoint** | Legacy memakai 900px/560px; default Tailwind 768px/640px. Ditentukan saat utilitas responsif pertama dibutuhkan. |

---

## 3. Langkah

### Langkah 0 — Baseline (sebelum mengubah apa pun)

Jalankan stack dev, lalu ambil screenshot. Isi tanggal `menu` dengan tanggal yang punya data seed.

```bash
npx playwright install chromium   # sekali saja; Playwright belum tentu ada di repo
pnpm docker:dev:up && pnpm docker:dev:seed

shoot() { # $1 = folder keluaran
  mkdir -p "$1"
  for w in 375 1440; do
    for entry in "home|/" "menu|/menu?date=2026-11-14" "checkout|/checkout" "quote|/quote" "pesanan|/pesanan"; do
      name="${entry%%|*}"; path="${entry#*|}"
      npx playwright screenshot --full-page --viewport-size="$w,900" \
        "http://127.0.0.1:4321$path" "$1/$name-$w.png"
    done
  done
}

shoot /tmp/before
shoot /tmp/before2
for f in /tmp/before/*.png; do cmp -s "$f" "/tmp/before2/$(basename "$f")" || echo "TIDAK STABIL: $(basename "$f")"; done
```

Halaman yang "tidak stabil" (animasi, jam, font eksternal) tidak layak jadi gerbang byte-identik.
Periksa halaman itu secara visual saja. Halaman `/order/[token]` tidak ikut karena butuh token.

### Langkah 1 — Samakan versi Tailwind

Dashboard memakai `tailwindcss` / `@tailwindcss/vite` **4.3.4**, web memakai **4.3.5**. Pilih satu versi
untuk kedua paket (pin tepat, tanpa `^`), lalu `pnpm install`.

### Langkah 2 — Buat `apps/web/src/styles/tailwind.css`

```css
/* Urutan layer ditetapkan SEKALI di sini. Berkas ini harus diimpor SEBELUM global.css. */
@layer theme, reset, base, components, utilities;

/* Tanpa preflight: global.css (layer `reset`) tetap satu-satunya reset. */
@import 'tailwindcss/theme.css' layer(theme);
@import 'tailwindcss/utilities.css' layer(utilities);

/* Hanya warna brand yang boleh dipakai. */
@theme {
  --color-*: initial;
}

/* Alias 1:1 ke variabel legacy di :root (global.css). Jangan salin nilainya ke sini. */
@theme inline {
  --color-white: #fff;
  --color-black: #000;

  --color-ink: var(--ink);
  --color-ink-soft: var(--ink-soft);
  --color-ink-muted: var(--ink-muted);
  --color-cream: var(--cream);
  --color-cream-deep: var(--cream-deep);
  --color-surface: var(--surface);
  --color-amber: var(--amber);
  --color-amber-bright: var(--amber-bright);
  --color-amber-soft: var(--amber-soft);
  --color-sage: var(--sage);
  --color-sage-deep: var(--sage-deep);
  --color-line: var(--border);
  --color-line-strong: var(--border-strong);
  --color-danger: var(--danger);
  --color-danger-soft: var(--danger-soft);
  --color-ok: var(--ok);
  --color-ok-soft: var(--ok-soft);
}
```

`line` dan `line-strong` sengaja menggantikan `border` / `border-strong` agar tidak muncul
`border-border`.

**Cek wajib sebelum lanjut:** daftar variabel di atas berasal dari audit v1.0 §2.1, bukan dari
membaca `global.css`. Variabel yang tidak ada akan gagal diam-diam (`var(--x)` tak terdefinisi).

```bash
for v in ink ink-soft ink-muted cream cream-deep surface amber amber-bright amber-soft \
         sage sage-deep border border-strong danger danger-soft ok ok-soft; do
  grep -q -- "--$v:" apps/web/src/styles/global.css || echo "HILANG: --$v"
done
```

Output harus kosong. Bila ada yang hilang, perbaiki alias di atas sebelum Langkah 3.

### Langkah 3 — Impor di layout

```astro
---
// apps/web/src/layouts/Layout.astro
import '../styles/tailwind.css'; // harus pertama
import '../styles/global.css';
---
```

### Langkah 4 — Smoke test sementara (jangan di-commit)

Tambahkan satu elemen di `src/pages/index.astro`:

```html
<div class="bg-ink text-cream p-4">smoke</div>
```

Utilitas Tailwind hanya dihasilkan bila kelasnya dipakai, jadi elemen ini perlu untuk membuktikan
pipeline.

### Langkah 5 — Verifikasi build

```bash
pnpm --filter @catering/web build        # sesuaikan nama paket bila berbeda
CSS=$(find apps/web/dist -name '*.css')

grep -o '@layer theme,reset,base,components,utilities' $CSS | head -1   # harus ada
grep -l 'file-selector-button' $CSS                                      # harus KOSONG: preflight tidak ikut
grep -o '\.bg-ink{[^}]*}' $CSS                                           # harus ada: background-color:var(--ink)
```

Bentuk persis keluaran bisa berbeda sedikit karena minifier; yang diperiksa adalah ketiga hal itu.
Lalu **hapus elemen smoke**, build ulang, dan pastikan `.bg-ink` sudah **tidak** ada (bukti bahwa
Tailwind tidak menambah CSS yang tak dipakai).

### Langkah 6 — Bandingkan screenshot, lalu commit

```bash
shoot /tmp/after
for f in /tmp/before/*.png; do
  cmp -s "$f" "/tmp/after/$(basename "$f")" && echo "SAMA  $(basename "$f")" || echo "BEDA  $(basename "$f")"
done
pnpm lint && pnpm typecheck && pnpm build && pnpm test
git add apps/web/src/styles/tailwind.css apps/web/src/layouts/Layout.astro package.json pnpm-lock.yaml
git commit -m "web: tambah fondasi Tailwind v4 (tanpa preflight, warna brand saja)"
```

Pada halaman yang **BEDA**: jangan lanjut. Penyebab paling mungkin urutan impor CSS, atau Preflight ikut
terimpor. Periksa ulang §3 Langkah 2–3 sebelum menyalahkan Tailwind.

---

## 4. Gerbang Fase 1

- [ ] Baseline stabil (`before` = `before2`) atau halaman tak stabil dicatat
- [ ] `grep` layer order menemukan deklarasi urutan yang benar
- [ ] `grep file-selector-button` kosong
- [ ] `.bg-ink` muncul saat dipakai dan hilang saat tidak dipakai
- [ ] Screenshot 5 halaman × 375/1440 `SAMA`, atau selisihnya dijelaskan
- [ ] `pnpm lint && typecheck && build && test` hijau
- [ ] Satu commit; `git revert` memulihkan kondisi awal
- [ ] Versi Tailwind web = dashboard

---

## 5. Aturan selama koeksistensi

1. Jangan edit `global.css`, kecuali menghapus kelas yang sudah terbukti tidak dipakai.
2. Tidak ada kelas baru di `@layer components`.
3. Tidak ada nilai warna arbitrer (`bg-[#c9721a]`); pakai token. Perlu warna baru → tambah alias ke `:root` legacy lalu ke `tailwind.css`.
4. Nama kelas ditulis utuh (`bg-ink`), tidak lewat interpolasi (`bg-${x}`), karena pemindai Tailwind membaca teks sumber.
5. Kunci `@theme` tidak boleh sama dengan nama variabel `:root` legacy. `--font-display`, `--font-body`, `--shadow-sm`, `--shadow-md`, `--radius-lg` bentrok dengan namespace Tailwind (`--font-*`, `--shadow-*`, `--radius-*`) dan menghasilkan referensi sirkular. Pakai nama baru (mis. `--shadow-card`).
6. Bila breakpoint diubah, nilainya harus literal (`900px`), bukan `var()`, karena media query tidak menerima variabel CSS.

---

## 6. Ditunda (dengan pemicu)

| Item | Dipicu oleh | Catatan dari audit |
| :-- | :-- | :-- |
| Alias semantik (`primary`, `surface`, …) | **Fase 1b** (adopsi `DESIGN.md`) | `DESIGN.md` web memakai nama peran M3 (`primary`, `on-surface`, `outline-variant`), berbeda dari nama shadcn di dashboard. Pakai nama `DESIGN.md`, tapi **nilainya direkonsiliasi dulu** (frontmatter vs prosa vs legacy saling bertentangan). |
| Nilai target `DESIGN.md` (font serif, radius 12/28, breakpoint 600/840/1200, `on-surface` baru) | Fase 1b, satu kelompok token per commit | Jangan digabung ke Fase 1: gerbang "tampilan identik" tidak akan lulus. |
| Font, bayangan, radius, spasi | Pertama kali ada utilitas yang memakainya | Hindari tabrakan nama (aturan 5). Tentukan sumber Noto Sans (self-host atau CDN) lebih dulu. |
| Skala tipografi | Komponen pertama yang butuh | Daftarkan sebagai `--text-*`; `text-label-medium` tidak akan ada bila hanya custom property biasa. |
| Breakpoint | Utilitas responsif pertama | Samakan legacy 900/560 dengan tema, nilai literal. |
| `cn`, CVA, `clsx`, `tailwind-merge` | Fase 3 | Versi sama dengan dashboard. |
| Komponen UI | Fase 3 | **Tulis ulang untuk SolidJS** (`class`, `for`, `splitProps`, tanpa destructuring props), bukan React. Mulai dari satu island (mis. `MenuBrowser`) sebelum menulis komponen lain. |
| Dark mode, RTL, elevasi level 3–5, token motion | Belum ada kebutuhan | Hapus dari rencana sampai ada kebutuhan nyata. |

---

## 7. Rollback dan risiko

**Rollback:** `git revert` commit Fase 1, atau hapus `tailwind.css` dan satu baris impor di `Layout.astro`.

| Risiko | Penanganan |
| :-- | :-- |
| Astro/Vite menaruh CSS dalam urutan lain di build production | `grep` layer order di Langkah 5 |
| Preflight ikut terimpor lewat jalur lain | `grep file-selector-button` kosong |
| Baseline tidak deterministik | Baseline dua kali; halaman tak stabil dibandingkan visual |
| Nama paket web bukan `@catering/web` | Sesuaikan `--filter` |

**Pertanyaan terbuka:** sumber font Noto Sans (self-host atau CDN)? Perlu `pnpm catalog` agar versi
Tailwind satu sumber di seluruh monorepo?
