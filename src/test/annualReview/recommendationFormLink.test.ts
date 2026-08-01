/** ADR-226 — every queue row must link back to its source review form. */
import { describe, expect, it } from 'vitest';
import type { RecommendationQueueRow } from '@/services/annualReview/recommendations';

const row = (over: Partial<RecommendationQueueRow>): RecommendationQueueRow =>
  ({ id: 'r1', instance_id: 'i1', employee_id: 'e1', source: 'stage_form', ...over } as RecommendationQueueRow);

export function hasSourceForm(r: RecommendationQueueRow): boolean {
  return typeof r.instance_id === 'string' && r.instance_id.length > 0;
}

describe('recommendation → review form link', () => {
  it('links stage_form rows', () => expect(hasSourceForm(row({}))).toBe(true));
  it('links legacy_import rows', () =>
    expect(hasSourceForm(row({ source: 'legacy_import' }))).toBe(true));
  it('flags a row that lost its instance reference', () =>
    expect(hasSourceForm(row({ instance_id: '' }))).toBe(false));
});
