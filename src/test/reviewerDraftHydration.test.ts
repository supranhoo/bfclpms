import { describe, it, expect } from 'vitest';
import {
  hydrateReviewerDraft,
  hasReviewerDraft,
  ReviewerHydrationSubmission,
  ReviewerStagePrefix,
} from '@/lib/reviewerDraftHydration';

function emptySub(overrides: Partial<ReviewerHydrationSubmission> = {}): ReviewerHydrationSubmission {
  return { achieved_value: null, ...overrides };
}

describe('hasReviewerDraft', () => {
  it.each<[string, ReviewerStagePrefix, ReviewerHydrationSubmission, boolean]>([
    ['score=0 counts as draft', 'auditor', emptySub({ auditor_score: 0 }), true],
    ['score=null + no other field is not a draft', 'auditor', emptySub(), false],
    ['rating-only counts', 'manager', emptySub({ manager_rating: 'green' }), true],
    ['empty remarks ignored', 'auditor', emptySub({ auditor_remarks: '   ' }), false],
    ['non-empty remarks count', 'auditor', emptySub({ auditor_remarks: 'note' }), true],
    ['achieved_value=0 counts', 'hr_pms', emptySub({ hr_pms_achieved_value: 0 }), true],
    ['evidence url counts', 'skip_level', emptySub({ skip_level_evidence_url: 'https://x' }), true],
    ['evidence urls array counts', 'management', emptySub({ management_evidence_urls: ['https://x'] }), true],
  ])('%s', (_, prefix, sub, expected) => {
    expect(hasReviewerDraft(sub, prefix)).toBe(expected);
  });

  it('undefined submission is not a draft', () => {
    expect(hasReviewerDraft(undefined, 'auditor')).toBe(false);
  });
});

describe('hydrateReviewerDraft — numeric', () => {
  const numericKpi = { uom_type: 'numeric' as const, qualitative_options: null };

  it('BUG-AUD-103: auditor saved 103/0 (Lower-is-Better) reopens as 103/0, NOT employee 99', () => {
    const sub = emptySub({
      achieved_value: 99,         // employee
      auditor_score: 0,           // auditor saved
      auditor_rating: 'red',
      auditor_achieved_value: 103,
      auditor_remarks: 'Total Coal Consumption 1.22 / Target 1.19 — 103%',
    });
    const bundle = hydrateReviewerDraft(sub, numericKpi, 'auditor');
    expect(bundle.source).toBe('reviewer-draft');
    expect(bundle.achievedValue).toBe(103);
    expect(bundle.score).toBe(0);
    expect(bundle.remarks).toContain('Coal');
  });

  it('Postgres numeric-as-string is parsed', () => {
    const sub = emptySub({
      auditor_score: '0.00' as any,
      auditor_achieved_value: '103' as any,
    });
    const bundle = hydrateReviewerDraft(sub, numericKpi, 'auditor');
    expect(bundle.score).toBe(0);
    expect(bundle.achievedValue).toBe(103);
    expect(bundle.source).toBe('reviewer-draft');
  });

  it('no reviewer draft → falls back to employee achieved_value, score stays null', () => {
    const sub = emptySub({ achieved_value: 99 });
    const bundle = hydrateReviewerDraft(sub, numericKpi, 'auditor');
    expect(bundle.source).toBe('employee-prefill');
    expect(bundle.achievedValue).toBe(99);
    expect(bundle.score).toBeNull();
  });

  it('reviewer-score-only (no achieved_value) → score wins, achievedValue null', () => {
    const sub = emptySub({ achieved_value: 99, manager_score: 3 });
    const bundle = hydrateReviewerDraft(sub, numericKpi, 'manager');
    expect(bundle.source).toBe('reviewer-draft');
    expect(bundle.score).toBe(3);
    expect(bundle.achievedValue).toBeNull();
  });

  it('reviewer-achieved-only (no score) → achievedValue wins, score null', () => {
    const sub = emptySub({ achieved_value: 99, auditor_achieved_value: 101 });
    const bundle = hydrateReviewerDraft(sub, numericKpi, 'auditor');
    expect(bundle.source).toBe('reviewer-draft');
    expect(bundle.score).toBeNull();
    expect(bundle.achievedValue).toBe(101);
  });

  it('undefined existing → empty', () => {
    const bundle = hydrateReviewerDraft(undefined, numericKpi, 'auditor');
    expect(bundle).toEqual({ achievedValue: null, score: null, remarks: '', evidenceUrls: [], source: 'empty' });
  });
});

describe('hydrateReviewerDraft — qualitative', () => {
  const binaryKpi = {
    uom_type: 'binary' as const,
    qualitative_options: [
      { label: 'Yes', rating: 5, definition: '' },
      { label: 'No', rating: 0, definition: '' },
    ],
  };

  it('binary draft derives label from saved score (canonical)', () => {
    const sub = emptySub({ auditor_score: 5, auditor_achieved_value: 5 });
    const bundle = hydrateReviewerDraft(sub, binaryKpi, 'auditor');
    expect(bundle.achievedValue).toBe('Yes');
    expect(bundle.score).toBe(5);
  });

  it('inverted safety binary (Yes=0/No=5) honours kpi qualitative_options', () => {
    const inverted = {
      uom_type: 'binary' as const,
      qualitative_options: [
        { label: 'Yes', rating: 0, definition: '' },
        { label: 'No', rating: 5, definition: '' },
      ],
    };
    const sub = emptySub({ auditor_score: 5 });
    const bundle = hydrateReviewerDraft(sub, inverted, 'auditor');
    expect(bundle.achievedValue).toBe('No');
  });

  it('no draft on qualitative → label derived from employee achieved_value', () => {
    const sub = emptySub({ achieved_value: 0 });
    const bundle = hydrateReviewerDraft(sub, binaryKpi, 'auditor');
    expect(bundle.source).toBe('employee-prefill');
    expect(bundle.achievedValue).toBe('No');
  });
});

describe('hydrateReviewerDraft — evidence urls', () => {
  it('prefers urls array over single url', () => {
    const sub = emptySub({
      auditor_score: 3,
      auditor_evidence_url: 'legacy',
      auditor_evidence_urls: ['a', 'b'],
    });
    const bundle = hydrateReviewerDraft(sub, { uom_type: 'numeric' }, 'auditor');
    expect(bundle.evidenceUrls).toEqual(['a', 'b']);
  });

  it('falls back to single url when array empty', () => {
    const sub = emptySub({ auditor_score: 3, auditor_evidence_url: 'legacy' });
    const bundle = hydrateReviewerDraft(sub, { uom_type: 'numeric' }, 'auditor');
    expect(bundle.evidenceUrls).toEqual(['legacy']);
  });
});

describe('cross-stage parity', () => {
  const stages: ReviewerStagePrefix[] = ['self', 'manager', 'skip_level', 'hr_pms', 'auditor', 'management'];

  it.each(stages)('%s: saved 50/2 reopens 50/2, not employee 80', (stage) => {
    const sub = emptySub({
      achieved_value: 80,
      [`${stage}_score`]: 2,
      [`${stage}_achieved_value`]: 50,
    });
    const bundle = hydrateReviewerDraft(sub, { uom_type: 'numeric' }, stage);
    expect(bundle.source).toBe('reviewer-draft');
    expect(bundle.achievedValue).toBe(50);
    expect(bundle.score).toBe(2);
  });
});