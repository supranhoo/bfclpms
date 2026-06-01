import { describe, it, expect } from 'vitest';
import { resolveFinalScore } from '@/lib/finalScoreResolver';

const ALL_STAGES = [
  'self', 'manager', 'functional_manager', 'skip_level',
  'hr_pms', 'auditor', 'management',
] as const;

describe('resolveFinalScore — terminal_stage (legacy default)', () => {
  it('returns null when every stage is null', () => {
    const r = resolveFinalScore({ stageScores: {}, workflowStages: [...ALL_STAGES], rule: null });
    expect(r.final_score).toBeNull();
    expect(r.rule_type_used).toBe('terminal_stage');
  });

  it('picks self when only self has a score', () => {
    const r = resolveFinalScore({
      stageScores: { self: 3.5 },
      workflowStages: [...ALL_STAGES], rule: null,
    });
    expect(r.final_score).toBe(3.5);
    expect(r.final_rating).toBe('green'); // round(3.5)=4 ⇒ green
  });

  it('management beats everything below in cascade', () => {
    const r = resolveFinalScore({
      stageScores: { self: 4.5, manager: 4, skip_level: 3, hr_pms: 2.5, auditor: 1, management: 5 },
      workflowStages: [...ALL_STAGES], rule: null,
    });
    expect(r.final_score).toBe(5);
    expect(r.final_rating).toBe('blue');
  });

  it('falls down cascade when higher stages are null', () => {
    const r = resolveFinalScore({
      stageScores: { self: 2, manager: 3, skip_level: 4 },
      workflowStages: [...ALL_STAGES], rule: null,
    });
    expect(r.final_score).toBe(4); // skip_level wins
  });
});

describe('resolveFinalScore — single-stage rules', () => {
  it('manager_final returns manager score', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 3.7, skip_level: 5 },
      workflowStages: [...ALL_STAGES],
      rule: { type: 'manager_final', missing_score_policy: 'block' },
    });
    expect(r.final_score).toBe(3.7);
  });

  it('hr_pms_final blocks when policy=block and stage missing', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 4 },
      workflowStages: [...ALL_STAGES],
      rule: { type: 'hr_pms_final', missing_score_policy: 'block' },
    });
    expect(r.final_score).toBeNull();
    expect(r.blocked).toBeTruthy();
  });

  it('hr_pms_final with policy=zero substitutes 0', () => {
    const r = resolveFinalScore({
      stageScores: {},
      workflowStages: [...ALL_STAGES],
      rule: { type: 'hr_pms_final', missing_score_policy: 'zero' },
    });
    expect(r.final_score).toBe(0);
    expect(r.final_rating).toBe('red');
  });
});

describe('resolveFinalScore — averages', () => {
  it('avg_manager_skip averages exactly two stages', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 4, skip_level: 3 },
      workflowStages: [...ALL_STAGES],
      rule: { type: 'avg_manager_skip', missing_score_policy: 'block' },
    });
    expect(r.final_score).toBe(3.5);
  });

  it('avg_all_completed silently skips missing stages', () => {
    const r = resolveFinalScore({
      stageScores: { self: 5, manager: 3 },
      workflowStages: [...ALL_STAGES],
      rule: { type: 'avg_all_completed', missing_score_policy: 'block' },
    });
    expect(r.final_score).toBe(4); // (5+3)/2
  });
});

describe('resolveFinalScore — weighted_custom', () => {
  it('60/40 Manager/Skip = 3.8', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 4.0, skip_level: 3.5 },
      workflowStages: [...ALL_STAGES],
      rule: {
        type: 'weighted_custom',
        missing_score_policy: 'block',
        stage_weights: { manager: 60, skip_level: 40 },
      },
    });
    expect(r.final_score).toBe(3.8);
  });

  it('50/25/25 Manager/Skip/Auditor weighted', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 4, skip_level: 3, auditor: 5 },
      workflowStages: [...ALL_STAGES],
      rule: {
        type: 'weighted_custom',
        missing_score_policy: 'block',
        stage_weights: { manager: 50, skip_level: 25, auditor: 25 },
      },
    });
    expect(r.final_score).toBe(4); // 4*50 + 3*25 + 5*25 = 400 / 100 = 4.0
  });

  it('drops stages not present in workflow', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 4, hr_pms: 2 },
      workflowStages: ['self', 'manager'], // hr_pms not in this workflow
      rule: {
        type: 'weighted_custom',
        missing_score_policy: 'ignore',
        stage_weights: { manager: 60, hr_pms: 40 },
      },
    });
    expect(r.final_score).toBe(4); // only manager contributes
    expect(r.missing_warnings.some(w => w.stage === 'hr_pms' && w.reason === 'not_in_workflow')).toBe(true);
  });

  it('blocks when a weighted stage has no score under policy=block', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 4 },
      workflowStages: [...ALL_STAGES],
      rule: {
        type: 'weighted_custom',
        missing_score_policy: 'block',
        stage_weights: { manager: 60, skip_level: 40 },
      },
    });
    expect(r.blocked).toBeTruthy();
    expect(r.final_score).toBeNull();
  });

  it('policy=ignore renormalises across present stages', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 4 },
      workflowStages: [...ALL_STAGES],
      rule: {
        type: 'weighted_custom',
        missing_score_policy: 'ignore',
        stage_weights: { manager: 60, skip_level: 40 },
      },
    });
    expect(r.final_score).toBe(4); // manager alone, weight 60 / 60
  });
});

describe('resolveFinalScore — N/A short-circuit', () => {
  it('isNa=true returns null and rule_type_used=na regardless of scores', () => {
    const r = resolveFinalScore({
      stageScores: { manager: 5, hr_pms: 5 },
      workflowStages: [...ALL_STAGES],
      rule: { type: 'weighted_custom', missing_score_policy: 'block', stage_weights: { manager: 100 } },
      isNa: true,
    });
    expect(r.final_score).toBeNull();
    expect(r.rule_type_used).toBe('na');
  });
});

describe('resolveFinalScore — rating bands', () => {
  it.each([
    [0.4, 'red'], [2.4, 'red'], [2.6, 'yellow'], [3.4, 'yellow'],
    [3.6, 'green'], [4.4, 'green'], [4.6, 'blue'], [5, 'blue'],
  ])('score=%s ⇒ rating=%s', (score, rating) => {
    const r = resolveFinalScore({
      stageScores: { manager: score },
      workflowStages: [...ALL_STAGES],
      rule: { type: 'manager_final', missing_score_policy: 'block' },
    });
    expect(r.final_rating).toBe(rating);
  });
});