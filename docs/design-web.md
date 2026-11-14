---
name: Artisanal Culinary Commerce
colors:
  surface: '#fffdf8'
  surface-dim: '#dddad1'
  surface-bright: '#fdf9f0'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f7f3ea'
  surface-container: '#f1eee5'
  surface-container-high: '#ece8df'
  surface-container-highest: '#e6e2d9'
  on-surface: '#1c1c17'
  on-surface-variant: '#434844'
  inverse-surface: '#31312b'
  inverse-on-surface: '#f4f0e7'
  outline: '#d5c9b2'
  outline-variant: '#e6ddcc'
  surface-tint: '#536258'
  primary: '#030e08'
  on-primary: '#fbf7ee'
  primary-container: '#e6ddcc'
  on-primary-container: '#17251d'
  inverse-primary: '#bacbbe'
  secondary: '#516257'
  on-secondary: '#ffffff'
  secondary-container: '#dbe6da'
  on-secondary-container: '#2f4a3a'
  tertiary: '#170700'
  on-tertiary: '#ffffff'
  tertiary-container: '#fdf0d8'
  on-tertiary-container: '#8a4a0d'
  error: '#a63f35'
  on-error: '#ffffff'
  error-container: '#fbeae7'
  on-error-container: '#7d2c25'
  primary-fixed: '#d6e7da'
  primary-fixed-dim: '#bacbbe'
  on-primary-fixed: '#111e17'
  on-primary-fixed-variant: '#3b4a41'
  secondary-fixed: '#d4e7d9'
  secondary-fixed-dim: '#b8cbbd'
  on-secondary-fixed: '#0f1f16'
  on-secondary-fixed-variant: '#3a4b40'
  tertiary-fixed: '#ffdcc3'
  tertiary-fixed-dim: '#ffb77d'
  on-tertiary-fixed: '#2f1500'
  on-tertiary-fixed-variant: '#6e3900'
  background: '#fdf9f0'
  on-background: '#1c1c17'
  surface-variant: '#f3ecdd'
  success: '#2c6e49'
  success-container: '#e4f1e7'
  on-success: '#ffffff'
  on-success-container: '#1a4d2e'
  amber-bright: '#ef9d34'
typography:
  display-lg:
    fontFamily: Noto Serif
    fontSize: 4rem
    fontWeight: '600'
    lineHeight: '1.05'
    letterSpacing: -0.02em
  display-lg-mobile:
    fontFamily: Noto Serif
    fontSize: 2.5rem
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.01em
  display-md:
    fontFamily: Noto Serif
    fontSize: 3rem
    fontWeight: '600'
    lineHeight: '1.1'
    letterSpacing: -0.015em
  display-md-mobile:
    fontFamily: Noto Serif
    fontSize: 2rem
    fontWeight: '600'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  display-sm:
    fontFamily: Noto Serif
    fontSize: 2.25rem
    fontWeight: '600'
    lineHeight: '1.15'
    letterSpacing: -0.01em
  headline-lg:
    fontFamily: Noto Serif
    fontSize: 1.875rem
    fontWeight: '600'
    lineHeight: '1.2'
    letterSpacing: -0.01em
  headline-md:
    fontFamily: Noto Sans
    fontSize: 1.375rem
    fontWeight: '600'
    lineHeight: '1.25'
    letterSpacing: '0'
  headline-sm:
    fontFamily: Noto Sans
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: '1.3'
    letterSpacing: '0'
  title-md:
    fontFamily: Noto Sans
    fontSize: 0.9375rem
    fontWeight: '600'
    lineHeight: '1.35'
    letterSpacing: 0.01em
  title-sm:
    fontFamily: Noto Sans
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.02em
  body-lg:
    fontFamily: Noto Sans
    fontSize: 1rem
    fontWeight: '400'
    lineHeight: '1.55'
    letterSpacing: '0'
  body-md:
    fontFamily: Noto Sans
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: '1.55'
    letterSpacing: '0'
  body-sm:
    fontFamily: Noto Sans
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: '1.5'
    letterSpacing: 0.01em
  label-lg:
    fontFamily: Noto Sans
    fontSize: 0.875rem
    fontWeight: '600'
    lineHeight: '1.4'
    letterSpacing: 0.01em
  label-sm:
    fontFamily: Noto Sans
    fontSize: 0.75rem
    fontWeight: '500'
    lineHeight: '1.5'
    letterSpacing: 0.03em
  eyebrow:
    fontFamily: Noto Sans
    fontSize: 0.75rem
    fontWeight: '700'
    lineHeight: '1.2'
    letterSpacing: 0.16em
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-md: 1.5rem
  gutter-lg: 2rem
  margin: 1rem
  margin-md: 1.5rem
  margin-lg: 2rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 1rem
  space-lg: 1.5rem
  space-xl: 2rem
  space-2xl: 2.5rem
  space-3xl: 3rem
---

## Revamp 2026-11 (berlaku untuk `apps/web`)

Arah visual diperbarui mengikuti mockup desktop (beranda, menu & tanggal, checkout, status pesanan, cek pesanan).
Bagian di bawah ini **menggantikan** aturan warna, tipografi, dan breakpoint lama bila bertentangan; nilai
front-matter di atas belum disinkronkan dan akan dirapikan pada siklus berikutnya.

- **Warna** (seed M3 `#E97814`): primary `#8a3b0c` (hover `#722f08`), aksen teks `#b84a08`, tombol aksen
  `#f58a2e` dengan teks `#2b1100`, kanvas `#fff7f2`, permukaan `#fffdfb`, garis `#f3dccd` / `#e6c7b2`.
  Nama token CSS lama (`--ink`, `--cream`, `--amber`, ...) dipertahankan; hanya nilainya yang berubah.
- **Tipografi**: Plus Jakarta Sans (variabel, di-host sendiri lewat `@fontsource-variable/plus-jakarta-sans`
  agar sesuai CSP `font-src 'self'`). Judul bobot 800, tanpa serif.
- **Breakpoint** (window size class M3): compact < 600, medium 600–839, expanded 840–1199, large ≥ 1200.
  Di bawah 840px tata letak satu kolom; keranjang menu menjadi bar melayang. Mulai 840px keranjang menjadi
  panel samping.
- **Bentuk**: kartu 24px, field 12px, tombol dan chip pil. Efek tiket miring pada beranda dihapus.
- **Aturan perubahan**: restyle tidak boleh mengubah rute, handler island, nama field form, atau panggilan API.

## Brand & Style

The design system embodies an artisan culinary storefront tailored for communal catering, family feasts, and celebration orders. Rooted in west sumatera culinary craft, hospitality, and tactile food aesthetics, the interface communicates heritage, generosity, and meticulous care. 

The aesthetic is a hybrid of **Tactile Warmth** and **Material Design 3 (M3) Modernity**. It moves away from sterile, corporate food tech in favor of textured print-menu cues: warm cream surfaces, forest ink typography, botanical sage accents, and glowing amber highlights. Visual weight feels human and physical—evoking heavy paper stock, handwritten receipts, and slow-simmered authenticity while retaining crisp touch targets, predictable responsive hierarchies, and contemporary web accessibility.

## Colors

The palette operates strictly in light mode to preserve the parchment-and-kitchen character of artisan dining. 

### Color Application Rules
- **Primary (`#17251d`)**: The dominant anchor. Used for high-emphasis headlines, strong interactive calls to action, dark navigation elements, and deep ink typography. Never use pure black (`#000000`).
- **Secondary (`#45564b`)**: Muted forest sage. Governs descriptive copy, supportive navigation, secondary buttons, and subdued micro-copy.
- **Tertiary (`#c9721a`)**: Culinary amber. Reserved for brand accents, high-priority state badges, price highlights, and active/hover indicators.
- **Neutral Canvas (`#fbf7ee`) & Surface (`#fffdf8`)**: Backgrounds mimic unbleached paper. Base panels and dish cards live on `#fffdf8`, layered over the `#fbf7ee` canvas or alternate `#f3ecdd` section bands.
- **Category & Atmospheric Gradients**:
  - *Amber Accent*: `linear-gradient(180deg, #fdf0d8, #c9721a)`
  - *Main Dish*: `linear-gradient(135deg, #f3d6a6, #e2b476 55%, #c98c45)`
  - *Side Dish*: `linear-gradient(135deg, #e3ecd7, #c6d8b9 55%, #9fbd8c)`
  - *Drink*: `linear-gradient(135deg, #dbe8ea, #b7d2d6 55%, #8fb6bd)`
  - *Dessert*: `linear-gradient(135deg, #f6dfd1, #eec3a9 55%, #d9a082)`
  - *Package*: `linear-gradient(135deg, #ecdcc9, #d9c0a2 55%, #bba17f)`

## Typography

The type system blends the traditional hospitality feel of high-contrast display serif headers (`Noto Serif`) with the clear, modern utility of sans-serif numerals and body text (`Noto Sans`).

### Typographic Hierarchy
- **Brand Display & Hero Headings**: Set in `Noto Serif` with tight tracking (`-0.02em` to `-0.01em`) to create an editorial, literary feel reminiscent of traditional culinary publications.
- **Section Headers & Product Titles**: Intermediate headings bridge display serifs for culinary category identity and crisp sans serifs for menu item names (`headline-md`).
- **Eyebrow Tags**: Rendered in uppercase `label-font` with generous tracking (`0.16em`). Pair with an inline horizontal dash (`26px × 2px`, rounded) preceding the text for editorial flair.
- **Price Indicators**: Set in `title-md` or `headline-md` using medium-to-bold weights to ensure clarity during checkout review.

## Layout & Spacing

The layout is built upon an 8-point base grid (with a 4-point micro-step for compact metadata, pills, and input padding), bound to Material Design 3 window size classes.

### Window Size Classes & Breakpoints
- **Compact (< 600px)**: 4-column layout. Single column dish layouts. Sticky bottom cart bar takes precedence. Gutter is `1rem`, page margins are `1rem` to `1.25rem`.
- **Medium (600px - 840px)**: 8-column layout. 2-column menu grids. Gutter scales to `1.5rem`.
- **Expanded (840px - 1200px)**: 12-column layout. Dedicated side checkout summary (`1.4fr` vs `0.85fr`). Gutter scales to `2rem`.
- **Large (> 1200px)**: 12-column layout with max-width constrained to `1120px` centered on canvas. 3 to 4-column menu offerings.

### Component Spacing Rhythms
- **Form Controls & Inputs**: `0.75rem` vertical by `1rem` horizontal padding.
- **Card Padding**: Standard cards feature `1.25rem` (`20px`) to `1.5rem` (`24px`) internal padding.
- **Header Dock**: Fixed height at `70px` with an inline backdrop filter to maintain legible scroll underneath.
- **Floating Bottom Bar**: Fixed floating bar suspended `1rem` (`16px`) above the bottom screen edge on mobile viewports.

## Elevation & Depth

Visual hierarchy uses tonal surface stacking combined with organic tinted drop shadows. Instead of cool, neutral grays or absolute blacks, shadows are tinted with the brand's primary ink (`#17251d`), maintaining the warm paper-stock atmosphere.

### Elevation Levels
- **Level 0 (Flat)**: `none`. Used for baseline background canvas, inset panels, and quiet input fields.
- **Level 1 (Resting Cards & Buttons)**: `0 1px 2px rgb(23 37 29 / 6%), 0 8px 24px -18px rgb(23 37 29 / 40%)`. Used for interactive dish cards, selectable date chips, and standard buttons.
- **Level 2 (Hover & Floating Controls)**: `0 2px 4px rgb(23 37 29 / 5%), 0 24px 60px -36px rgb(23 37 29 / 55%)`. Used for hover states on dish cards, the persistent mobile cart bar, and menu summary tickets.
- **Level 3 (Overlays & Dialogs)**: `0 4px 8px rgb(23 37 29 / 6%), 0 32px 72px -48px rgb(23 37 29 / 60%)`. Applied to date-picker flyouts, portion modifier modals, and active popovers.
- **Level 4 / 5 (Temporary Sheets)**: Reserved for full checkout drawers and global toast notifications.

### Outlines & Glassmorphism
- Surfaces at Level 0 and 1 are enclosed by a subtle `1px solid #e6ddcc` (`outline-variant`) border to maintain edge clarity against cream backgrounds.
- The sticky site navigation bar applies a `14px` backdrop blur over an 80% alpha neutral fill (`rgba(251, 247, 238, 0.8)`).

## Shapes

The design system employs a rounded shape language balanced between organic curves and functional utility.

### Corner Radius Mapping
- **Pill (`9999px`)**: Primary and secondary action buttons, quantity selectors, status chips, search input containers, and category badges.
- **Extra Large (`28px` / `1.75rem`)**: Dish presentation cards, order status wrappers, step indicator panels, and catering package bundles.
- **Medium (`12px` / `0.75rem`)**: Form text fields, date selection tiles, dropdown options, and modal containers.
- **Small (`8px` / `0.5rem`)**: Inline notification boxes, tooltips, and warning containers.
- **Tactile Escape Hatch (Ticket Style)**: The summary panel features an intentional rotational tilt (`rotate: 1.2deg`) and an inset dashed border (`border-dashed border-outline`) inset by `10px`, evoking an authentic handwritten kitchen ticket.

## Components

### Buttons
- **Primary Action**: Pill-shaped (`rounded-full`), `#17251d` fill, `#fbf7ee` text, `0.75rem` vertical and `1.5rem` horizontal padding. On hover: shifts slightly (`active:translate-y-0.5`) with Level 2 elevation.
- **Secondary Action**: Pill-shaped (`rounded-full`), `#dbe6da` (sage) fill, `#2f4a3a` text. On hover: darkened sage tint.
- **Tertiary / Amber Action**: Pill-shaped, `#c9721a` fill with `#fbf7ee` text. Used for time-sensitive or high-conversion catering checkout buttons.
- **Quantity Selector**: Segmented pill component composed of a minus button, portion count text, and a plus button. Touch targets are strictly circular `36px × 36px` (`size-9`) with centered typographic glyphs (`+`, `−`).

### Cards & Menu Offerings
- **Dish Cards**: Built on `#fffdf8` with `28px` rounded corners, bounded by a `1px solid #e6ddcc` outline.
- **Media Presentation**: Aspect ratio fixed at `16:10`. If dish images are loading or absent, provide category gradient backgrounds displaying an uppercase initial glyph (`text-headline-large font-display text-on-surface/50`).
- **Card Headers**: Dish title set in `headline-md`, followed by portion size hints and bold amber pricing (`title-md`).

### Form Fields & Inputs
- **Base Fields**: Input boxes styled with `12px` rounded corners, `#fffdf8` background, and `1px solid #d5c9b2`. Padding is `0.75rem 1rem`.
- **Focus State**: Replaces border with a high-contrast ink focus ring (`ring-2 ring-primary ring-offset-2 ring-offset-background`).
- **Validation Errors**: Border shifts to `#a63f35` (`error`) with an accompanying inline caption in `label-sm` (`#7d2c25`).

### Chips & Badges
- **Category Filter Chips**: Pill-shaped containers (`rounded-full`). Unselected state uses transparent background with `#d5c9b2` outline; active state fills with `#17251d` and text `#fbf7ee`.
- **Dietary & Allergen Badges**: Soft amber container (`#fdf0d8`) or sage container (`#dbe6da`) with compact padding (`0.25rem 0.625rem`) and `label-sm` weight.

### Selection Controls (Checkboxes & Radios)
- **Checkboxes**: `20px × 20px` boxes with `4px` corner radii. Checked state fills `#17251d` with `#fbf7ee` checkmark icon.
- **Radio Buttons**: Concentric circles with active center dot rendered in `#c9721a` (amber accent).

### Floating Mobile Cart Bar
- Suspended `16px` above screen bottom, spanning `calc(100% - 2rem)`.
- Pill-shaped (`rounded-full`), background set to `#17251d` (`inverse-surface`), elevation Level 2.
- Text and counter in `#fbf7ee`, checkout chevron or accent button in `#ef9d34` (`inverse-primary`).
