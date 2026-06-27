import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Phase 9.2.d static contract test — HTTP 546 finalize-OOM regression guard.
//
// The Deno test `verify_integrity_memory_test.ts` proves the verifier doesn't
// download files via behavioral mocks. This test pins the *source* so any PR
// that re-introduces the forbidden patterns fails the main `vitest` run too,
// even before edge-function tests execute. Mirrors the Phase-9 I6–I15
// contract-test convention.

const RAW = readFileSync(
  resolve(__dirname, '../../../supabase/functions/create-backup/index.ts'),
  'utf8',
);

// Strip comments so doc-comment mentions of the forbidden tokens don't
// trip the contract test (the policy applies to executable code only).
const SRC = RAW
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|\n)\s*\/\/[^\n]*/g, '$1');

function sliceFunction(src: string, name: string): string {
  const startMarker = `function ${name}(`;
  const start = src.indexOf(startMarker);
  if (start < 0) throw new Error(`${name} not found in create-backup/index.ts`);
  // Find the matching closing brace at column 0 — functions in this file are
  // top-level, so the next line that starts with `}` ends the body.
  const after = src.slice(start);
  const endRel = after.search(/\n\}\n/);
  if (endRel < 0) throw new Error(`${name} body end not found`);
  return after.slice(0, endRel);
}

describe('backup finalize — memory contract (WP-9.2.d)', () => {
  it('verifyBackupIntegrity does NOT download per-file payloads', () => {
    const body = sliceFunction(SRC, 'verifyBackupIntegrity');
    expect(
      body.includes('.download('),
      'verifyBackupIntegrity must not call storage.download — re-introduces HTTP 546 finalize OOM',
    ).toBe(false);
    expect(
      body.includes('JSON.parse(text)'),
      'verifyBackupIntegrity must not JSON.parse table payloads — re-introduces HTTP 546 finalize OOM',
    ).toBe(false);
    expect(
      body.includes('blob.text()'),
      'verifyBackupIntegrity must not materialize blob.text() — re-introduces HTTP 546 finalize OOM',
    ).toBe(false);
  });

  it('still pins the existing batch-memory and hard-fail policy', () => {
    expect(SRC).toMatch(/BATCH_SIZE\s*=\s*4\b/);
    expect(SRC).toContain('loadHardFailOnPartial(');
  });
});