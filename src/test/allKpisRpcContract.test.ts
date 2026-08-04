import { describe, it, expect } from 'vitest';
import fs from 'node:fs';

// ADR-250 — useAllKpis must never regress to a direct paged `kpis` read:
// per-row RLS over the full table was the #1 database cost and starved the
// Storage API, breaking evidence previews.
describe('useAllKpis routes through get_all_kpis_slim (ADR-250)', () => {
  const src = fs.readFileSync('src/hooks/useKpis.ts', 'utf-8');
  const block = src.split('export function useAllKpis')[1]?.split('\nexport ')[0] ?? '';

  it('finds the hook body', () => {
    expect(block).toBeTruthy();
  });

  it('calls the SECURITY DEFINER RPC', () => {
    expect(block).toMatch(/rpc\(['"]get_all_kpis_slim['"]\)/);
  });

  it('pages the RPC so the 1000-row cap cannot truncate', () => {
    expect(block).toMatch(/fetchAllRpcPaged/);
    expect(block).toMatch(/\.range\(from,\s*to\)/);
  });

  it('does not read the kpis table directly', () => {
    expect(block).not.toMatch(/from\(['"]kpis['"]\)/);
  });
});

describe('EvidencePreviewDialog streams previews (ADR-250)', () => {
  const src = fs.readFileSync('src/components/review/EvidencePreviewDialog.tsx', 'utf-8');

  it('does not buffer objects through storage.download()', () => {
    expect(src).not.toMatch(/\.download\(decodeURIComponent/);
  });

  it('uses signed URLs for streaming', () => {
    expect(src).toMatch(/createSignedUrl/);
  });

  it('guards with a timeout and offers retry', () => {
    expect(src).toMatch(/PREVIEW_TIMEOUT_MS/);
    expect(src).toMatch(/setRetryToken/);
  });
});
