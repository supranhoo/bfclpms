/**
 * Phase 11 governance guard.
 * Asserts the SLA v2 surface introduces ZERO new writer paths.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHASE11_FILES = [
  'src/components/safety/SafetySlaQueueCard.tsx',
  'src/components/safety/SafetySlaBadge.tsx',
  'src/lib/safetySla.ts',
];

const FORBIDDEN: Array<{ name: string; re: RegExp }> = [
  { name: '.insert(', re: /\.insert\s*\(/ },
  { name: '.update(', re: /\.update\s*\(/ },
  { name: '.upsert(', re: /\.upsert\s*\(/ },
  { name: '.delete(', re: /\.delete\s*\(/ },
  { name: '.upload(', re: /\.upload\s*\(/ },
  { name: '.rpc(', re: /\.rpc\s*\(/ },
  { name: 'fetch(', re: /\bfetch\s*\(/ },
  { name: 'supabase.channel(', re: /supabase\.channel\s*\(/ },
];

describe('Phase 11 — SLA v2 contract guard', () => {
  for (const rel of PHASE11_FILES) {
    it(`${rel} introduces no forbidden writers / fetchers`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      for (const { name, re } of FORBIDDEN) {
        expect(re.test(src), `${rel} must not contain: ${name}`).toBe(false);
      }
    });
  }
});