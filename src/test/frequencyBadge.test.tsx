import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { FrequencyBadge } from '@/components/review/FrequencyBadge';

describe('FrequencyBadge', () => {
  const visibleFrequencies = ['Daily', 'Weekly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

  for (const freq of visibleFrequencies) {
    it(`renders label for ${freq}`, () => {
      const { getByText } = render(<FrequencyBadge frequency={freq} />);
      expect(getByText(freq)).toBeTruthy();
    });
  }

  it('returns null for Monthly (suppressed default)', () => {
    const { container } = render(<FrequencyBadge frequency="Monthly" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for unknown frequency', () => {
    const { container } = render(<FrequencyBadge frequency="Hourly" />);
    expect(container.firstChild).toBeNull();
  });

  it('returns null for nullish frequency', () => {
    const { container } = render(<FrequencyBadge frequency={null} />);
    expect(container.firstChild).toBeNull();
  });
});
