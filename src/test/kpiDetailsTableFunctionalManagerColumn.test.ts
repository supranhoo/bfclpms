/**
 * ADR-194 §WF-STAGE-SSOT — the KPI Details table must render a Functional
 * Manager score column for F1 workflows and must keep it out of non-F1 ones.
 *
 * Regression guard: STAGE_COLUMN_MAP previously omitted
 * `functional_manager_check`, so the column silently disappeared even though
 * the dashboard stage strip advertised the stage.
 */
import { describe, it, expect } from 'vitest';
import { buildScoreColumns, getScoreForColumn } from '@/components/review/KpiDetailsTable';
import { CANONICAL_WORKFLOW_STAGES, canonicalStageOrder } from '@/lib/reviewConstants';

const F1_WORKFLOW = ['kra_set', 'self_review', 'manager_check', 'functional_manager_check', 'audit', 'approved'];
const NON_F1_WORKFLOW = ['kra_set', 'self_review', 'manager_check', 'audit', 'approved'];

describe('KpiDetailsTable — Functional Manager column', () => {
  it('renders a Functional Mgr column for an F1 workflow', () => {
    const cols = buildScoreColumns(F1_WORKFLOW);
    const fm = cols.find(c => c.key === 'functional_manager_score');
    expect(fm).toBeDefined();
    expect(fm?.label).toBe('Functional Mgr');
  });

  it('places Functional Mgr directly after Manager', () => {
    const keys = buildScoreColumns(F1_WORKFLOW).map(c => c.key);
    expect(keys.indexOf('functional_manager_score')).toBe(keys.indexOf('manager_score') + 1);
  });

  it('omits the column for a non-F1 workflow', () => {
    const keys = buildScoreColumns(NON_F1_WORKFLOW).map(c => c.key);
    expect(keys).not.toContain('functional_manager_score');
  });

  it('always appends Final last', () => {
    const keys = buildScoreColumns(F1_WORKFLOW).map(c => c.key);
    expect(keys[keys.length - 1]).toBe('final_score');
  });
});

describe('KpiDetailsTable — Functional Manager score resolution', () => {
  it('reads functional_manager_score from the submission', () => {
    const submission = { functional_manager_score: 4 } as any;
    expect(getScoreForColumn(submission, 'functional_manager_score', 'audit')).toBe(4);
  });

  it('returns null when the FM stage is unscored', () => {
    const submission = { functional_manager_score: null } as any;
    expect(getScoreForColumn(submission, 'functional_manager_score', 'functional_manager_check')).toBeNull();
  });

  it('returns null when there is no submission at all', () => {
    expect(getScoreForColumn(undefined, 'functional_manager_score', 'self_review')).toBeNull();
  });

  it('keeps a zero FM score distinguishable from "not scored"', () => {
    const submission = { functional_manager_score: 0 } as any;
    expect(getScoreForColumn(submission, 'functional_manager_score', 'audit')).toBe(0);
  });
});

describe('Canonical stage ordering with F1', () => {
  it('orders functional_manager_check between manager_check and skip_level_check', () => {
    expect(canonicalStageOrder('functional_manager_check')).toBeGreaterThan(canonicalStageOrder('manager_check'));
    expect(canonicalStageOrder('functional_manager_check')).toBeLessThan(canonicalStageOrder('skip_level_check'));
  });

  it('includes every stage the table can render', () => {
    expect(CANONICAL_WORKFLOW_STAGES).toContain('functional_manager_check');
  });
});
