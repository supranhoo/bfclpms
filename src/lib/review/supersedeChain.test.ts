import { describe, it, expect } from 'vitest';
import { planSupersede, supersedeCaption } from './supersedeChain';

const CHAIN = ['self_review', 'manager_check', 'skip_level_check', 'hr_pms_review', 'management_review', 'approved'];

describe('ADR-290 console stage supersede', () => {
  it('a one-step move supersedes nothing', () => {
    const p = planSupersede(CHAIN, 'self_review', 'manager_check');
    expect(p).toEqual({ actionable: true, superseded: [] });
  });

  it('a higher stage closes every stage in between', () => {
    const p = planSupersede(CHAIN, 'self_review', 'hr_pms_review');
    expect(p.actionable).toBe(true);
    expect(p.superseded).toEqual(['manager_check', 'skip_level_check']);
  });

  it('never moves backwards — that is a rollback request', () => {
    expect(planSupersede(CHAIN, 'hr_pms_review', 'manager_check').reason).toBe('backwards');
    expect(planSupersede(CHAIN, 'manager_check', 'manager_check').reason).toBe('backwards');
  });

  it('respects the employee-specific chain, not a global ladder', () => {
    const short = ['self_review', 'manager_check', 'approved'];
    expect(planSupersede(short, 'self_review', 'hr_pms_review').reason).toBe('not_in_workflow');
  });

  it('refuses unknown statuses and terminal rows', () => {
    expect(planSupersede(CHAIN, 'approved', 'management_review').reason).toBe('terminal_stage');
    expect(planSupersede(CHAIN, 'kra_set', 'manager_check').reason).toBe('status_unknown');
  });

  it('captions state plainly what a leap will close', () => {
    const p = planSupersede(CHAIN, 'self_review', 'hr_pms_review');
    expect(supersedeCaption(p, 'hr_pms_review')).toBe(
      'Signing at HR PMS also closes Manager, Skip level',
    );
    expect(supersedeCaption(planSupersede(CHAIN, 'self_review', 'manager_check'), 'manager_check'))
      .toBe('Moves to Manager');
  });
});
