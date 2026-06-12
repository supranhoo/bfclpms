import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 2 — Duplicate Incident Handling regression guardrails.
 * These assert wire-level contracts and UI plumbing without spinning up
 * the full app, so the build agent can verify scope quickly.
 */

const ROOT = resolve(__dirname, '..', '..', '..');
function read(rel: string): string {
  return readFileSync(resolve(ROOT, rel), 'utf8');
}

describe('Safety Incident Duplicate Handling — Phase 2', () => {
  it('hook layer exposes mark + close + picker + role-rows helpers', () => {
    const src = read('src/hooks/useSafetyIncidents.ts');
    expect(src).toContain('useMarkIncidentDuplicate');
    expect(src).toContain('useCloseDuplicateIncident');
    expect(src).toContain('useSafetyIncidentsForDuplicatePicker');
    expect(src).toContain('useMySafetyRoleRows');
    expect(src).toContain("'mark_incident_duplicate'");
    expect(src).toContain("'close_duplicate_incident'");
    // Row type carries the new columns
    expect(src).toContain('duplicate_of_id?: string | null');
    expect(src).toContain('marked_duplicate_by?: string | null');
    expect(src).toContain('marked_duplicate_at?: string | null');
    expect(src).toContain('duplicate_remarks?: string | null');
  });

  it('mark-duplicate dialog requires a master selection and remarks', () => {
    const src = read('src/components/safety/MarkDuplicateDialog.tsx');
    // canSubmit requires both selectedId and trimmed remarks.
    expect(src).toMatch(/canSubmit\s*=\s*!!selectedId\s*&&\s*remarks\.trim\(\)\.length\s*>\s*0/);
    // Picker excludes the source incident and is scoped to the BU.
    expect(src).toContain('excludeIncidentId: incident.id');
    expect(src).toContain('businessUnitId: incident.business_unit_id');
  });

  it('close-duplicate dialog calls the dedicated RPC hook', () => {
    const src = read('src/components/safety/CloseDuplicateDialog.tsx');
    expect(src).toContain('useCloseDuplicateIncident');
    expect(src).toContain('close.mutate');
  });

  it('picker query is server-paginated, BU-scoped, and excludes non-eligible masters', () => {
    const src = read('src/hooks/useSafetyIncidents.ts');
    // Cap rows on the server (range 0..24 = 25 results).
    expect(src).toMatch(/\.range\(0,\s*24\)/);
    // Excludes closed/orphaned and rows that are themselves duplicates.
    expect(src).toContain(".neq('status', 'closed')");
    expect(src).toContain(".neq('status', 'orphaned')");
    expect(src).toContain(".is('duplicate_of_id', null)");
  });

  it('incident detail page guards mark/close actions and renders the duplicate banner', () => {
    const src = read('src/pages/safety/SafetyIncidentDetail.tsx');
    expect(src).toContain('MarkDuplicateDialog');
    expect(src).toContain('CloseDuplicateDialog');
    expect(src).toContain('canMarkDuplicate');
    expect(src).toContain('canCloseDuplicate');
    // BU-Head scope: must match BU or be null (org-wide), or admin override.
    expect(src).toMatch(/r\.role === 'bu_head'/);
    expect(src).toMatch(/r\.business_unit_id == null \|\| r\.business_unit_id === incident\.business_unit_id/);
    expect(src).toMatch(/isSafetyHeadRole \|\| isAdminRole/);
    // Marked-duplicate banner branch.
    expect(src).toContain('isMarkedDuplicate');
    expect(src).toContain('Marked as duplicate');
  });

  it('incident list shows a duplicate badge alongside status', () => {
    const src = read('src/pages/safety/SafetyIncidents.tsx');
    expect(src).toContain('duplicate_of_id');
    expect(src).toMatch(/Dup pending|Duplicate pending/);
  });
});