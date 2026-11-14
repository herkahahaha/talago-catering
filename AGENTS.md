---
language: id-ID
---

# AGENTS.md — konteks proyek

Indeks seluruh dokumen: [`docs/README.md`](docs/README.md).

## Aturan kerja
- Jangan menulis tabel milik modul lain; impor lintas modul lewat `../<modul>/index`.
- Setiap perubahan skema wajib `pnpm db:generate` + migrasi; jangan edit SQL migrasi lama.
- Batas porsi per order default 200 (setting `order.max_portions_per_order`), minimal 50;
  target minimum produksi terpisah dan tidak membatasi checkout.
- Menu dihapus soft delete; order lama memakai snapshot.
- Jangan commit kredensial production; `.env` lokal sudah di-gitignore.
