#!/usr/bin/env node
/**
 * Tes fixture untuk check-docs.mjs: salin repo kecil ke tmp, rusakkan satu hal,
 * pastikan skrip GAGAL. Lalu pastikan salinan utuh LULUS.
 */
import { mkdtempSync, cpSync, writeFileSync, readFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import assert from 'node:assert/strict';

const REPO = join(dirname(fileURLToPath(import.meta.url)), '..');
const SCRIPT = join(REPO, 'scripts/check-docs.mjs');

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'check-docs-'));
  for (const p of ['docs', 'packages/contracts/src']) {
    mkdirSync(join(dir, p), { recursive: true });
    cpSync(join(REPO, p), join(dir, p), { recursive: true });
  }
  for (const f of ['README.md', 'AGENTS.md']) cpSync(join(REPO, f), join(dir, f));
  return dir;
}

function run(root) {
  return spawnSync(process.execPath, [SCRIPT], {
    env: { ...process.env, CHECK_DOCS_ROOT: root },
    encoding: 'utf8',
  });
}

function mutate(root, rel, fn) {
  const p = join(root, rel);
  writeFileSync(p, fn(readFileSync(p, 'utf8')));
}

const cases = [
  {
    name: 'utuh harus lulus',
    mutate: () => {},
    expectFail: false,
  },
  {
    name: 'kode error hilang dari docs/api.md',
    mutate: (r) => mutate(r, 'docs/api.md', (s) => s.replace(/^\| `RATE_LIMITED`.*\n/m, '')),
    expectFail: true,
    expectMsg: 'RATE_LIMITED',
  },
  {
    name: 'baris kode error salah format',
    mutate: (r) => mutate(r, 'docs/api.md', (s) => s.replace(/^\| `NOT_FOUND` \| 404 \|/m, '| NOT_FOUND | 404 |')),
    expectFail: true,
    expectMsg: 'tidak bisa dibaca',
  },
  {
    name: 'kata "paid" di prosa tidak lagi memberi positif palsu',
    mutate: (r) => mutate(r, 'docs/quick-reference.md', (s) => s.replace('### Status Flow', '### Status Flow\nKata paid di luar diagram.')),
    expectFail: false,
  },
  {
    name: 'status hilang dari diagram',
    mutate: (r) => mutate(r, 'docs/quick-reference.md', (s) => s.replace(/paid_after_expiry/g, 'X_EXPIRY')),
    expectFail: true,
    expectMsg: 'paid_after_expiry',
  },
  {
    name: 'tautan README ke berkas yang tidak ada',
    mutate: (r) => mutate(r, 'docs/README.md', (s) => s + '\n[hilang](session-summary.md)\n'),
    expectFail: true,
    expectMsg: 'session-summary.md',
  },
  {
    name: 'tautan rusak di README akar',
    mutate: (r) => mutate(r, 'README.md', (s) => s + '\n[rusak](docs/design-web.md.md)\n'),
    expectFail: true,
    expectMsg: 'design-web.md.md',
  },
  {
    name: 'rujukan `docs/...md` ke berkas yang tidak ada',
    mutate: (r) => mutate(r, 'docs/quick-reference.md', (s) => s + '\n- `docs/DESIGN.md`\n'),
    expectFail: true,
    expectMsg: 'docs/DESIGN.md',
  },
  {
    name: 'berkas docs/ tidak tertaut dari indeks',
    mutate: (r) => writeFileSync(join(r, 'docs/yatim.md'), '# yatim\n'),
    expectFail: true,
    expectMsg: 'docs/yatim.md',
  },
  {
    name: 'path absolut pengguna terdeteksi',
    mutate: (r) => mutate(r, 'docs/docker.md', (s) => s + '\nLokasi: /Users/nama/proyek\n'),
    expectFail: true,
    expectMsg: '/Users/',
  },
];

let failed = 0;
for (const c of cases) {
  const root = fixture();
  c.mutate(root);
  const res = run(root);
  const out = res.stdout + res.stderr;
  const ok =
    c.expectFail
      ? res.status !== 0 && (!c.expectMsg || out.includes(c.expectMsg))
      : res.status === 0;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${c.name}`);
  if (!ok) {
    failed++;
    console.log(out);
  }
}

if (failed) {
  console.error(`\n${failed} tes gagal.`);
  process.exit(1);
}
console.log('\nSemua tes fixture lolos.');
