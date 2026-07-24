import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import {
  OverallRecommendationCard,
  collectRecommendations,
  RECOMMENDATION_KEY,
  RECOMMENDATION_REQUIRED_ROLES,
  RECOMMENDATION_ROLES,
} from './OverallRecommendationCard';

describe('collectRecommendations', () => {
  it('returns non-empty recommendations in stage order', () => {
    const out = collectRecommendations([
      { reviewer_role: 'bu_head', qualitative_responses: { [RECOMMENDATION_KEY]: 'bu note' } },
      { reviewer_role: 'dept_head', qualitative_responses: { [RECOMMENDATION_KEY]: 'dept note' } },
      { reviewer_role: 'manager', qualitative_responses: { [RECOMMENDATION_KEY]: '' } },
    ]);
    expect(out.map((r) => r.role)).toEqual(['dept_head', 'bu_head']);
  });
});

describe('OverallRecommendationCard', () => {
  it('renders nothing when no editable stage and no prior recommendations', () => {
    const { container } = render(
      <OverallRecommendationCard
        role="manager"
        locked={false}
        draftValue=""
        onChangeDraft={vi.fn()}
        responses={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders an editable textarea for BU Head on an unlocked stage', () => {
    const onChange = vi.fn();
    render(
      <OverallRecommendationCard
        role="bu_head"
        locked={false}
        draftValue="draft"
        onChangeDraft={onChange}
        responses={[]}
      />,
    );
    const ta = screen.getByLabelText(/Your recommendation/i) as HTMLTextAreaElement;
    expect(ta.value).toBe('draft');
    fireEvent.change(ta, { target: { value: 'updated' } });
    expect(onChange).toHaveBeenCalledWith('updated');
  });

  it('renders read-only aggregate for locked reviewer with prior recs', () => {
    render(
      <OverallRecommendationCard
        role="hr"
        locked
        draftValue=""
        onChangeDraft={vi.fn()}
        responses={[
          { reviewer_role: 'dept_head', qualitative_responses: { [RECOMMENDATION_KEY]: 'promote' } },
          { reviewer_role: 'bu_head', qualitative_responses: { [RECOMMENDATION_KEY]: 'agreed' } },
        ]}
        reviewerNames={{ dept_head: 'Priya S.', bu_head: 'Anil P.' }}
      />,
    );
    expect(screen.getByText(/promote/)).toBeInTheDocument();
    expect(screen.getByText(/agreed/)).toBeInTheDocument();
    expect(screen.getByText(/Priya S\./)).toBeInTheDocument();
    expect(screen.queryByLabelText(/Your recommendation/i)).toBeNull();
  });
});

describe('Overall recommendation requiredness (POLICY §AR-RECOMMENDATION-REQUIRED)', () => {
  it('includes management in required and authoring roles', () => {
    expect(RECOMMENDATION_ROLES).toContain('management');
    expect(RECOMMENDATION_REQUIRED_ROLES).toEqual(expect.arrayContaining(['bu_head', 'management']));
    expect(RECOMMENDATION_REQUIRED_ROLES).not.toContain('dept_head');
  });

  it('marks the field as required for Management', () => {
    render(
      <OverallRecommendationCard
        role="management"
        locked={false}
        draftValue=""
        onChangeDraft={vi.fn()}
        responses={[]}
      />,
    );
    const ta = screen.getByLabelText(/Your recommendation/i) as HTMLTextAreaElement;
    expect(ta).toBeInTheDocument();
    expect(ta.getAttribute('aria-required')).toBe('true');
    expect(screen.getByText(/required before this review can be submitted/i)).toBeInTheDocument();
  });

  it('keeps Dept Head remark optional', () => {
    render(
      <OverallRecommendationCard
        role="dept_head"
        locked={false}
        draftValue=""
        onChangeDraft={vi.fn()}
        responses={[]}
      />,
    );
    const ta = screen.getByLabelText(/Your recommendation/i) as HTMLTextAreaElement;
    expect(ta.getAttribute('aria-required')).toBe('false');
  });
});