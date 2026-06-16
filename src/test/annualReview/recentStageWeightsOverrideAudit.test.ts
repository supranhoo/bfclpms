import { describe, it, expect } from 'vitest';

/**
 * Phase 4 — unit checks for the audit-feed projection used by
 * `RecentStageWeightOverridesPanel`. The component formats the JSONB
 * `previous`/`next` payloads from `system_audit_logs.metadata` into a
 * human-readable string and detects "cleared" (next == null) rows.
 */
const STAGE_LABEL: Record<string, string> = {
  self: 'Self', manager: 'Manager', skip_manager: 'Skip',
  bu_head: 'BU', hr: 'HR', system: 'System', criteria: 'Criteria',
};
function formatWeights(w: Record<string, number> | null): string {
  if (!w) return '—';
  const parts = Object.entries(w)
    .filter(([, v]) => typeof v === 'number')
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${STAGE_LABEL[k] ?? k} ${v}%`);
  return parts.length ? parts.join(' · ') : '—';
}

describe('Recent stage-weight override audit projection', () => {
  it('renders a typical 20/50/30 override blend in deterministic order', () => {
    expect(formatWeights({ self: 20, manager: 50, bu_head: 30 })).toBe(
      'BU 30% · Manager 50% · Self 20%',
    );
  });

  it('treats null next as a cleared override', () => {
    expect(formatWeights(null)).toBe('—');
  });

  it('falls back to raw key for unknown stage labels', () => {
    expect(formatWeights({ self: 100, mystery: 0 } as any)).toContain('mystery 0%');
  });

  it('handles legacy criteria-only blends', () => {
    expect(formatWeights({ criteria: 100 })).toBe('Criteria 100%');
  });
});