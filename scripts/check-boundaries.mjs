#!/usr/bin/env node
/**
 * Penjaga batas modul (PRD §6.2):
 *  - Modul di packages/core/src/modules/<m> hanya boleh mengimpor modul lain
 *    lewat pintu publik `../<modul>/index`, bukan file internalnya.
 *  - Aplikasi hanya boleh mengimpor paket lewat `@catering/core` dan
 *    `@catering/contracts`, bukan path dalam `src/`.
 *  - Modul tidak boleh mengimpor tabel skema modul lain.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const CORE_MODULES = join(ROOT, 'packages/core/src/modules');
const violations = [];

function walk(dir) {
  const entries = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) entries.push(...walk(path));
    else if (/\.(ts|tsx|mjs)$/.test(name)) entries.push(path);
  }
  return entries;
}

function modulesOf(dir) {
  return readdirSync(dir).filter((name) => statSync(join(dir, name)).isDirectory());
}

const modules = modulesOf(CORE_MODULES);

for (const file of walk(CORE_MODULES)) {
  const rel = relative(CORE_MODULES, file);
  const owner = rel.split('/')[0];
  const source = readFileSync(file, 'utf8');
  const importPattern = /(?:from\s+|import\s*\(\s*)['"](\.[^'"]+)['"]/g;
  let match;
  while ((match = importPattern.exec(source)) !== null) {
    const specifier = match[1];
    if (!specifier.startsWith('..')) continue;
    const parts = specifier.split('/').filter(Boolean);
    // ../<target>/... dihitung dari folder modul pemilik
    const target = parts[1];
    if (!modules.includes(target)) continue;
    if (target === owner) continue;
    const isPublicEntry = parts.length === 3 && parts[2] === 'index';
    if (!isPublicEntry) {
      violations.push(
        `${relative(ROOT, file)}: impor lintas modul wajib lewat ../${target}/index (ditemukan "${specifier}")`,
      );
    }
  }
}

for (const app of ['apps/api', 'apps/web', 'apps/dashboard']) {
  for (const file of walk(join(ROOT, app, 'src'))) {
    const source = readFileSync(file, 'utf8');
    if (/from\s+['"]@catering\/(core|contracts)\/src/.test(source)) {
      violations.push(
        `${relative(ROOT, file)}: impor langsung ke src paket internal tidak diizinkan; gunakan @catering/core atau @catering/contracts`,
      );
    }
  }
}

if (violations.length > 0) {
  console.error('Batas modul dilanggar:');
  for (const violation of violations) console.error(`  ✗ ${violation}`);
  process.exit(1);
}

console.log(`Batas modul OK (${modules.length} modul diperiksa).`);
