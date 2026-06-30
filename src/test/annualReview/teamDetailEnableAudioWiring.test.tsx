import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import {
  AnnualReviewI18nProvider,
  useAnnualReviewI18n,
} from '@/components/annual-review/AnnualReviewI18nContext';

/**
 * Regression for ADR-103 v1.0.1.
 *
 * TeamReviewDetailContent previously forgot to pass `enableAudio` into
 * AnnualReviewI18nProvider, so every <SpeakButton> on the team / auditor /
 * manager / skip / BU detail routes silently rendered null.
 *
 * These tests pin the provider contract directly so the same omission shows
 * up as a unit-test failure rather than a UI regression.
 */
function Probe() {
  const { enableAudio } = useAnnualReviewI18n();
  return <span data-testid="audio">{String(enableAudio)}</span>;
}

describe('AnnualReviewI18nProvider — enableAudio wiring', () => {
  it('forwards enableAudio=true into context', () => {
    render(
      <AnnualReviewI18nProvider currentLanguage="hi" defaultLanguage="en" enableAudio>
        <Probe />
      </AnnualReviewI18nProvider>,
    );
    expect(screen.getByTestId('audio').textContent).toBe('true');
  });

  it('defaults to false when prop omitted (today’s safe default)', () => {
    render(
      <AnnualReviewI18nProvider currentLanguage="hi" defaultLanguage="en">
        <Probe />
      </AnnualReviewI18nProvider>,
    );
    expect(screen.getByTestId('audio').textContent).toBe('false');
  });

  it('treats explicit false / null as off', () => {
    const { rerender } = render(
      <AnnualReviewI18nProvider currentLanguage="hi" defaultLanguage="en" enableAudio={false}>
        <Probe />
      </AnnualReviewI18nProvider>,
    );
    expect(screen.getByTestId('audio').textContent).toBe('false');
    rerender(
      <AnnualReviewI18nProvider currentLanguage="hi" defaultLanguage="en" enableAudio={null}>
        <Probe />
      </AnnualReviewI18nProvider>,
    );
    expect(screen.getByTestId('audio').textContent).toBe('false');
  });
});