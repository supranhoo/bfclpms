import { describe, it, expect } from 'vitest';
import {
  buildEditPayload, editableSystemScoreSlots, pointsForRaw,
} from '@/services/annualReview/adminSystemScores';
import type { TemplateSystemScore } from '@/types/annualReview';

const banded: TemplateSystemScore = {
  id: 'sys_lti', name: 'LTI Rate', weight: 5,
  scoring_rules: {
    direction: 'lower_better',
    bands: [
      { score: 5, threshold: 0 }, { score: 4, threshold: 1 },
      { score: 3, threshold: 2 }, { score: 1, threshold: 3 }, { score: 0, threshold: 4 },
    ],
  },
} as TemplateSystemScore;

const carry: TemplateSystemScore = {
  id: 'sys_kra', name: 'Carry KRA', weight: 60, source: 'carry_kra',
} as TemplateSystemScore;

const unbanded: TemplateSystemScore = { id: 'sys_plain', name: 'Plain', weight: 10 } as TemplateSystemScore;

describe('ADR-217 — admin system score corrections', () => {
  it('excludes carry_kra slots from the editable set', () => {
    expect(editableSystemScoreSlots([banded, carry, unbanded]).map((s) => s.id))
      .toEqual(['sys_lti', 'sys_plain']);
  });

  it('derives points from the template bands', () => {
    expect(pointsForRaw(banded, 0).points).toBeCloseTo(5, 5);
    expect(pointsForRaw(banded, 2).points).toBeCloseTo(3, 5);
    expect(pointsForRaw(banded, 9).points).toBeCloseTo(0, 5);
  });

  it('treats unbanded slots as pre-scaled points clamped to the weight', () => {
    expect(pointsForRaw(unbanded, 7).points).toBe(7);
    expect(pointsForRaw(unbanded, 50).points).toBe(10);
  });

  it('sends only changed slots and never carry_kra', () => {
    const p = buildEditPayload({
      instanceId: 'i1',
      slots: [banded, carry, unbanded],
      storedRaw: { sys_lti: 2, sys_plain: 7 },
      drafts: { sys_lti: '0', sys_plain: '7', sys_kra: '3' },
      reason: 'restated',
    });
    expect(Object.keys(p.raw)).toEqual(['sys_lti']);
    expect(p.points.sys_lti).toBeCloseTo(5, 4);
    expect(p.names.sys_lti).toBe('LTI Rate');
  });

  it('allows downward corrections (bidirectional)', () => {
    const p = buildEditPayload({
      instanceId: 'i1', slots: [banded], storedRaw: { sys_lti: 0 },
      drafts: { sys_lti: '3' }, reason: 'correction',
    });
    expect(p.raw.sys_lti).toBe(3);
    expect(p.points.sys_lti).toBeCloseTo(1, 4);
  });

  it('ignores blank and non-numeric drafts', () => {
    const p = buildEditPayload({
      instanceId: 'i1', slots: [banded, unbanded], storedRaw: {},
      drafts: { sys_lti: '', sys_plain: 'abc' }, reason: 'x',
    });
    expect(Object.keys(p.raw)).toHaveLength(0);
  });
});
