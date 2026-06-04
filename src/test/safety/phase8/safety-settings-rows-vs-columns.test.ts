/**
 * Phase 8 SSOT — `safety_settings` is a rows-keyed store.
 *
 * Phase 8 keeps two legacy columns (`ui_incident_v2`, `incident_stage_copy`)
 * physically present because the pre-flight NULL gate failed (defaults
 * populated every row, so a destructive DROP was deferred — see ADR
 * `docs/safety/phase8-release-readiness.md`). Runtime code must continue to
 * read the equivalent VALUES via the rows-keyed `key/value` JSON interface,
 * never via column accessors, so the eventual column drop is a no-op.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';

function rg(pattern: string): string {
  try {
    return execSync(`rg -n --no-heading -S '${pattern}' src`, { encoding: 'utf8' });
  } catch (e: unknown) {
    const err = e as { status?: number; stdout?: Buffer | string };
    if (err.status === 1) return '';
    throw e;
  }
}

describe('Phase 8 — safety_settings rows vs columns', () => {
  it('IncidentStageHeader reads incident_stage_copy as a ROW key, not a column', () => {
    const src = readFileSync('src/components/safety/IncidentStageHeader.tsx', 'utf8');
    expect(src).toMatch(/r\.key\s*===\s*['"]incident_stage_copy['"]/);
  });

  it('SafetyIncidentDetail reads ui_incident_v2 as a ROW key, not a column', () => {
    const src = readFileSync('src/pages/safety/SafetyIncidentDetail.tsx', 'utf8');
    expect(src).toMatch(/r\.key\s*===\s*['"]ui_incident_v2['"]/);
  });

  it('no source file selects ui_incident_v2 or incident_stage_copy as columns', () => {
    const colSelect = rg(`\\.select\\([^)]*(ui_incident_v2|incident_stage_copy)`);
    expect(colSelect).toBe('');
  });

  it('no source file destructures ui_incident_v2/incident_stage_copy from a safety_settings row object', () => {
    // Property access pattern: identChar before the dot (e.g. row.ui_incident_v2),
    // which excludes `safety_settings.incident_stage_copy` in comments.
    const propAccess = rg(`[A-Za-z0-9_\\]\\)]\\.(ui_incident_v2|incident_stage_copy)\\b`);
    const offending = propAccess
      .split('\n')
      .filter((l) => l)
      .filter((l) => !l.startsWith('src/integrations/supabase/types.ts:'))
      .filter((l) => !l.startsWith('src/test/'))
      // Exclude doc-comment references like `safety_settings.incident_stage_copy`.
      .filter((l) => !/safety_settings\.(ui_incident_v2|incident_stage_copy)/.test(l));
    expect(offending).toEqual([]);
  });
});
