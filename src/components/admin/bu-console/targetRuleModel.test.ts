/** ADR-288 — one KPI, tiered targets: the right band must win. */
import { describe, it, expect } from 'vitest';
import { resolveTarget, ruleMatches, describeRule } from './targetRuleModel';
import type { TargetRule } from '@/hooks/useBuConsoleRun';

const rule = (over: Partial<TargetRule>): TargetRule => ({
  id: over.id ?? 'r', category_id: null, kra_name: 'kra', kpi_key: 'k',
  kpi_name: 'SOP creation', review_period: null, review_year: null,
  match_dimension: 'default', match_value: null, target_value: '5',
  priority: 100, notes: null, ...over,
});

const managerRule = rule({ id: 'mgr', match_dimension: 'is_manager', match_value: 'true', target_value: '10', priority: 10 });
const levelRule = rule({ id: 'lvl', match_dimension: 'level', match_value: 'L4', target_value: '8', priority: 20 });
const fallback = rule({ id: 'def', match_dimension: 'default', target_value: '5' });

describe('resolveTarget', () => {
  const rules = [fallback, levelRule, managerRule];

  it('gives a manager the manager target', () => {
    expect(resolveTarget(rules, { isManager: true })?.target_value).toBe('10');
  });

  it('falls back to the default for a plain team member', () => {
    expect(resolveTarget(rules, { isManager: false, level: 'L2' })?.target_value).toBe('5');
  });

  it('prefers the lower priority number when two specific rules match', () => {
    expect(resolveTarget(rules, { isManager: true, level: 'L4' })?.id).toBe('mgr');
  });

  it('uses a level rule when the person does not manage anyone', () => {
    expect(resolveTarget(rules, { isManager: false, level: 'l4' })?.target_value).toBe('8');
  });

  it('returns null when nothing matches and there is no default', () => {
    expect(resolveTarget([levelRule], { level: 'L1' })).toBeNull();
  });
});

describe('ruleMatches', () => {
  it('matches designation case-insensitively', () => {
    expect(ruleMatches(rule({ match_dimension: 'designation', match_value: 'Shift Incharge' }),
      { designation: 'shift incharge' })).toBe(true);
  });
  it('matches a department by id', () => {
    expect(ruleMatches(rule({ match_dimension: 'department', match_value: 'd1' }), { departmentId: 'd1' })).toBe(true);
    expect(ruleMatches(rule({ match_dimension: 'department', match_value: 'd1' }), { departmentId: 'd2' })).toBe(false);
  });
});

describe('describeRule', () => {
  it('reads as plain English', () => {
    expect(describeRule(managerRule)).toBe('Manages people');
    expect(describeRule(levelRule)).toBe('Level = L4');
    expect(describeRule(fallback)).toBe('Everyone else');
  });
});
