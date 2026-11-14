#!/usr/bin/env node
/**
 * Validasi konsistensi dokumentasi dengan kontrak (PRD §6.2).
 *
 * Pemeriksaan:
 *  1. Kode error di docs/api.md (tabel "## Kode error") = ERROR_CODES di packages/contracts/src/errors.ts
 *  2. Status order di docs/architecture.md (blok diagram "## N. State machine order") = ORDER_STATUSES di packages/contracts/src/enums.ts
 *  3. Setiap tautan berkas Markdown di docs/README.md ada di disk
 *  4. Tidak ada path absolut lokal (/Users/, /home/, C:\) di docs/
 *
 * Env opsional:
 *  CHECK_DOCS_ROOT  akar repo (dipakai tes fixture)
 */
import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = process.env.CHECK_DOCS_ROOT
  ? process.env.CHECK_DOCS_ROOT
  : join(dirname(fileURLToPath(import.meta.url)), '..');

const violations = [];
const read = (rel) => readFileSync(join(ROOT, rel), 'utf8');

/** Ambil isi array konstanta TypeScript bernama `name` sebagai daftar string. */
function readTsStringArray(relPath, name) {
  const src = read(relPath);
  const m = src.match(new RegExp(`export const ${name}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(as const)?`));
  if (!m) return null;
  return m[1]
    .split(',')
    .map((s) => s.trim().replace(/^['"`]|['"`]$/g, ''))
    .filter(Boolean);
}

/** Ambil baris-baris di bawah heading `## <title>` sampai heading `##` berikutnya. */
function sectionLines(md, title) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => l.trim() === `## ${title}`);
  if (start === -1) return null;
  const out = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i])) break;
    out.push(lines[i]);
  }
  return out;
}

// ========== 1. KODE ERROR ==========
{
  const contractCodes = readTsStringArray('packages/contracts/src/errors.ts', 'ERROR_CODES');
  if (!contractCodes) {
    violations.push('contracts/errors.ts: ERROR_CODES tidak ditemukan atau tidak terbaca');
  } else {
    const section = sectionLines(read('docs/api.md'), 'Kode error');
    if (!section) {
      violations.push('docs/api.md: bagian "## Kode error" tidak ditemukan');
    } else {
      const docCodes = [];
      let badRows = 0;
      for (const line of section) {
        const t = line.trim();
        if (!t.startsWith('|')) continue;
        if (/^\|\s*Kode\s*\|/.test(t) || /^\|\s*:?--/.test(t)) continue; // header & pemisah
        const m = t.match(/^\|\s*`([A-Z_]+)`\s*\|\s*\d{3}\s*\|/);
        if (m) docCodes.push(m[1]);
        else badRows++;
      }
      if (badRows > 0) {
        violations.push(`docs/api.md: ${badRows} baris tabel kode error tidak bisa dibaca (format harus | \`KODE\` | HTTP | Arti |)`);
      }
      const missing = contractCodes.filter((c) => !docCodes.includes(c));
      const extra = docCodes.filter((d) => !contractCodes.includes(d));
      if (missing.length) violations.push(`Kode di contracts tapi tidak di docs/api.md: ${missing.join(', ')}`);
      if (extra.length) violations.push(`Kode di docs/api.md tapi tidak di contracts: ${extra.join(', ')}`);
      if (!missing.length && !extra.length && !badRows) {
        console.log(`Kode error OK (${contractCodes.length} kode).`);
      }
    }
  }
}

// ========== 2. STATUS ORDER ==========
{
  const contractStatuses = readTsStringArray('packages/contracts/src/enums.ts', 'ORDER_STATUSES');
  if (!contractStatuses) {
    violations.push('contracts/enums.ts: ORDER_STATUSES tidak ditemukan atau tidak terbaca');
  } else {
    const arch = read('docs/architecture.md');
    const fm = arch.match(/## \d+\. State machine order[\s\S]*?```([\s\S]*?)```/);
    if (!fm) {
      violations.push('docs/architecture.md: bagian "## N. State machine order" dengan blok diagram tidak ditemukan');
    } else {
      // Isi blok kode di bawah "State machine order" hanya berisi diagram, jadi seluruh blok dipindai.
      // Prosa di luar blok (mis. "paid" di kalimat biasa) tidak ikut terbaca.
      const tokenPattern = new RegExp(`\\b(${contractStatuses.join('|')})\\b`, 'g');
      const docStatuses = [...new Set(fm[1].match(tokenPattern) || [])].sort();
      const sortedContract = [...contractStatuses].sort();
      const missing = sortedContract.filter((s) => !docStatuses.includes(s));
      const extra = docStatuses.filter((s) => !sortedContract.includes(s));
      if (missing.length) violations.push(`Status di contracts tapi tidak di diagram architecture: ${missing.join(', ')}`);
      if (extra.length) violations.push(`Status di diagram architecture tapi tidak di contracts: ${extra.join(', ')}`);
      if (!missing.length && !extra.length) {
        console.log(`Status order OK (${contractStatuses.length} status).`);
      }
    }
  }
}

// ========== 3. TAUTAN & RUJUKAN BERKAS ==========
// Semua tautan Markdown ke .md (relatif terhadap berkas pemuat) dan rujukan `docs/....md`
// (relatif terhadap akar repo) di docs/, README.md, dan AGENTS.md harus ada di disk.
// Setiap berkas .md di docs/ (selain README) harus tertaut dari docs/README.md.
{
  const docFiles = [];
  const walkDocs = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walkDocs(p);
      else if (name.endsWith('.md')) docFiles.push(p);
    }
  };
  walkDocs(join(ROOT, 'docs'));
  const scanned = [...docFiles, ...['README.md', 'AGENTS.md'].map((n) => join(ROOT, n)).filter(existsSync)];

  let checked = 0;
  const broken = [];
  for (const f of scanned) {
    const src = readFileSync(f, 'utf8');
    const rel = relative(ROOT, f);
    const targets = [];
    for (const m of src.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)\s]*)?\)/g)) {
      if (!/^[a-z][a-z0-9+.-]*:/i.test(m[1])) targets.push(join(dirname(f), m[1]));
    }
    for (const m of src.matchAll(/`(docs\/[A-Za-z0-9_./-]+\.md)`/g)) targets.push(join(ROOT, m[1]));
    for (const t of targets) {
      checked++;
      if (!existsSync(t)) broken.push(`${rel} -> ${relative(ROOT, t)}`);
    }
  }
  if (broken.length) violations.push(`Tautan/rujukan ke berkas yang tidak ada: ${broken.join('; ')}`);
  else console.log(`Tautan & rujukan berkas OK (${checked} di ${scanned.length} berkas).`);

  const indexPath = join(ROOT, 'docs/README.md');
  const indexSrc = readFileSync(indexPath, 'utf8');
  const linked = new Set(
    [...indexSrc.matchAll(/\]\(([^)\s#]+\.md)(?:#[^)\s]*)?\)/g)].map((m) => join(dirname(indexPath), m[1])),
  );
  const orphans = docFiles.filter((f) => f !== indexPath && !linked.has(f)).map((f) => relative(ROOT, f));
  if (orphans.length) violations.push(`Berkas docs/ tidak tertaut dari docs/README.md: ${orphans.join(', ')}`);
  else console.log('Semua berkas docs/ tertaut dari docs/README.md.');
}

// ========== 4. PATH ABSOLUT LOKAL ==========
{
  const badPattern = /(\/Users\/[^\s`)]+|\/home\/[^\s`)]+|[A-Z]:\\[^\s`)]+)/g;
  const files = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (name.endsWith('.md')) files.push(p);
    }
  };
  walk(join(ROOT, 'docs'));
  for (const f of files) {
    const hits = readFileSync(f, 'utf8').match(badPattern) || [];
    for (const h of hits) violations.push(`${relative(ROOT, f)}: path lokal "${h}"`);
  }
  if (!violations.some((v) => v.includes('path lokal'))) console.log(`Tidak ada path lokal (${files.length} berkas).`);
}

// ========== HASIL ==========
if (violations.length) {
  console.error('\nDokumen tidak konsisten:');
  for (const v of violations) console.error(`  ✗ ${v}`);
  process.exit(1);
}
console.log('\nSemua validasi dokumen lolos.');
