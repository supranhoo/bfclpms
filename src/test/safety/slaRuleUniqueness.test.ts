/**
 * Regression lock — SLA rule uniqueness rebased onto configured Type/Severity IDs.
 *
 * RCA 2026-06-12: saving a rule for a custom configured incident type (e.g.
 * "Spillage") raised a false 23505 duplicate because the partial unique
 * indexes were built on the LEGACY enum columns and the UI coerces custom
 * types to the `near_miss` fallback. The migration rebased both indexes onto
 * (incident_type_id, severity_id[, priority]) keeping the SAME index names,
 * so `translateSlaRuleError` keeps matching.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { translateSlaRuleError } from '@/hooks/useSafetyIncidentSlaRules';

describe('translateSlaRuleError', () => {
  it('translates the catch-all duplicate (id-based index name unchanged)', () => {
    const msg = translateSlaRuleError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_safety_sla_rules_active_any_priority"',
    });
    expect(msg).toMatch(/Any priority \(catch-all\)/);
  });

  it('translates the specific-priority duplicate', () => {
    const msg = translateSlaRuleError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_safety_sla_rules_active_specific"',
    });
    expect(msg).toMatch(/Incident Type \+ Severity \+ Priority/);
  });

  it('translates legacy safety-net index violations via substring match', () => {
    const msg = translateSlaRuleError({
      code: '23505',
      message: 'duplicate key value violates unique constraint "uq_safety_sla_rules_active_specific_legacy"',
    });
    expect(msg).toMatch(/already exists/);
    expect(msg).not.toMatch(/duplicate key value/);
  });

  it('falls back to a generic friendly message for unknown 23505s', () => {
    const msg = translateSlaRuleError({ code: '23505', message: 'duplicate key value violates unique constraint "other_idx"' });
    expect(msg).toBe('A matching active rule already exists. Edit or deactivate the existing rule first.');
  });

  it('passes through non-duplicate errors untouched', () => {
    expect(translateSlaRuleError({ code: '42501', message: 'permission denied' })).toBe('permission denied');
  });
});

describe('SLA rule editor still sends configured IDs (source lock)', () => {
  const src = readFileSync('src/components/safety/settings/SafetySlaRulesTab.tsx', 'utf8');

  it('submits incident_type_id and severity_id alongside legacy enum fallbacks', () => {
    expect(src).toContain('incident_type_id: typeId');
    expect(src).toContain('severity_id: severityId');
    // Legacy NOT NULL columns still receive a coerced fallback — harmless now
    // that uniqueness is keyed on the ID columns.
    expect(src).toContain("'near_miss'");
  });
});