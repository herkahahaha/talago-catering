#!/usr/bin/env node
/**
 * Validasi konsistensi dokumentasi dengan kontrak (PRD §6.2):
 *  - Kode error di docs/api.md harus sama dengan ERROR_CODES di packages/contracts/src/errors.ts
 *  - Status order di docs/quick-reference.md (diagram alur) harus sama dengan ORDER_STATUSES di packages/contracts/src/enums.ts
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = new URL('..', import.meta.url).pathname;
const violations = [];

// ========== ERROR CODES ==========
// Baca ERROR_CODES dari contracts
const errorsContent = readFileSync(join(ROOT, 'packages/contracts/src/errors.ts'), 'utf8');
const errorCodesMatch = errorsContent.match(/export const ERROR_CODES = \[([\s\S]*?)\]/);
if (!errorCodesMatch) {
  violations.push('contracts/errors.ts: tidak ditemukan ERROR_CODES');
} else {
  const contractErrorCodes = errorCodesMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/['"`]/g, ''))
    .filter(Boolean);
  // console.log('Contract error codes:', contractErrorCodes);

  // Baca kode error dari docs/api.md (tabel markdown)
  const apiDocContent = readFileSync(join(ROOT, 'docs/api.md'), 'utf8');
  const errorTableMatch = apiDocContent.match(/## Kode error([\s\S]*?)(?:\n##|\n$)/);
  if (!errorTableMatch) {
    violations.push('docs/api.md: tidak ditemukan bagian "## Kode error"');
  } else {
    const tableText = errorTableMatch[1];
    // Parse tabel markdown: | `KODE` | HTTP | Arti |
    const docErrorCodes = [];
    for (const line of tableText.split('\n')) {
      const trimmed = line.trim();
      if (trimmed.startsWith('| `') && !trimmed.startsWith('| Kode')) {
        const match = trimmed.match(/\| `([^`]+)` \|/);
        if (match) docErrorCodes.push(match[1]);
      }
    }
    // console.log('Doc error codes:', docErrorCodes);

    // Bandingkan
    const missingInDoc = contractErrorCodes.filter((c) => !docErrorCodes.includes(c));
    const extraInDoc = docErrorCodes.filter((d) => !contractErrorCodes.includes(d));

    if (missingInDoc.length > 0) {
      violations.push(`Kode error di contracts tapi tidak di docs/api.md: ${missingInDoc.join(', ')}`);
    }
    if (extraInDoc.length > 0) {
      violations.push(`Kode error di docs/api.md tapi tidak di contracts: ${extraInDoc.join(', ')}`);
    }
    if (missingInDoc.length === 0 && extraInDoc.length === 0) {
      console.log(`Kode error OK (${contractErrorCodes.length} kode cocok).`);
    }
  }
}

// ========== ORDER STATUSES ==========
// Baca ORDER_STATUSES dari contracts
const enumsContent = readFileSync(join(ROOT, 'packages/contracts/src/enums.ts'), 'utf8');
const orderStatusesMatch = enumsContent.match(/export const ORDER_STATUSES = \[([\s\S]*?)\]/);
if (!orderStatusesMatch) {
  violations.push('contracts/enums.ts: tidak ditemukan ORDER_STATUSES');
} else {
  const contractOrderStatuses = orderStatusesMatch[1]
    .split(',')
    .map((s) => s.trim().replace(/['"`]/g, ''))
    .filter(Boolean);
  // console.log('Contract order statuses:', contractOrderStatuses);

  // Baca status order dari docs/quick-reference.md (diagram alur)
  const quickRefContent = readFileSync(join(ROOT, 'docs/quick-reference.md'), 'utf8');
  // Cari diagram alur status (bagian "### Status Flow" atau diagram mermaid-like)
  const flowMatch = quickRefContent.match(/### Status Flow[\s\S]*?```([\s\S]*?)```/);
  if (!flowMatch) {
    violations.push('docs/quick-reference.md: tidak ditemukan bagian "### Status Flow" dengan diagram');
  } else {
    const flowText = flowMatch[1];
    // Ekstrak status dari diagram: pending_payment, paid, in_production, out_for_delivery, delivered, expired, cancelled_refunded, paid_after_expiry
    const statusPattern = /\b(pending_payment|paid|in_production|out_for_delivery|delivered|expired|cancelled_refunded|paid_after_expiry)\b/g;
    const docOrderStatuses = [...new Set(flowText.match(statusPattern) || [])].sort();
    // console.log('Doc order statuses:', docOrderStatuses);

    // Bandingkan
    const missingInDoc = contractOrderStatuses.filter((c) => !docOrderStatuses.includes(c));
    const extraInDoc = docOrderStatuses.filter((d) => !contractOrderStatuses.includes(d));

    if (missingInDoc.length > 0) {
      violations.push(`Status order di contracts tapi tidak di docs/quick-reference.md: ${missingInDoc.join(', ')}`);
    }
    if (extraInDoc.length > 0) {
      violations.push(`Status order di docs/quick-reference.md tapi tidak di contracts: ${extraInDoc.join(', ')}`);
    }
    if (missingInDoc.length === 0 && extraInDoc.length === 0) {
      console.log(`Status order OK (${contractOrderStatuses.length} status cocok).`);
    }
  }
}

// ========== HASIL ==========
if (violations.length > 0) {
  console.error('\nDokumen tidak konsisten dengan kontrak:');
  for (const violation of violations) console.error(`  ✗ ${violation}`);
  process.exit(1);
}

console.log('\nSemua validasi dokumen lolos.');