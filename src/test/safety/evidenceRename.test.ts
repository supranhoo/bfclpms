import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = resolve(__dirname, '..', '..', '..');
const read = (rel: string) => readFileSync(resolve(ROOT, rel), 'utf8');

describe('Safety Evidence Rename — Phase 3', () => {
  it('hook calls the rename RPC and invalidates the evidence cache', () => {
    const src = read('src/hooks/useSafetyIncidentDetail.ts');
    expect(src).toContain('useRenameIncidentEvidence');
    expect(src).toContain("'rename_incident_evidence'");
    expect(src).toContain("['safety', 'incident', incidentId, 'evidence']");
    expect(src).toContain('original_file_name?: string | null');
  });

  it('EvidenceList exposes pencil only to the uploader and downloads with display name', () => {
    const src = read('src/components/safety/EvidenceList.tsx');
    // Uploader gating
    expect(src).toMatch(/canRename\s*=\s*!!user\s*&&\s*r\.uploaded_by\s*===\s*user\.id/);
    // Inline rename keyboard contract
    expect(src).toMatch(/e\.key === 'Enter'/);
    expect(src).toMatch(/e\.key === 'Escape'/);
    // Download uses anchor with display name
    expect(src).toContain("a.download = displayName");
    // Original-name tooltip on renamed rows
    expect(src).toContain('original_file_name');
    expect(src).toMatch(/wasRenamed/);
  });
});