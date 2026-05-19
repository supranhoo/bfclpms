import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { CompareCell } from './CompareCell';

describe('CompareCell', () => {
  it('renders both values when equal', () => {
    const { container } = render(<CompareCell a="Monthly" b="Monthly" />);
    expect(container.textContent).toContain('Monthly');
    expect(container.querySelector('[title^="Equal"]')).toBeTruthy();
  });

  it('highlights differing values', () => {
    const { container } = render(<CompareCell a="Monthly" b="Quarterly" />);
    expect(container.querySelector('[title^="Differs"]')).toBeTruthy();
    expect(container.textContent).toContain('Monthly');
    expect(container.textContent).toContain('Quarterly');
  });

  it('shows dash when value is missing', () => {
    const { container } = render(<CompareCell a={null} b="Monthly" />);
    expect(container.textContent).toContain('—');
    expect(container.textContent).toContain('Monthly');
  });

  it('renders mixed indicator dot', () => {
    const { container } = render(<CompareCell a="Monthly" b="Monthly" mixedA />);
    expect(container.querySelector('[title="Linked KPIs disagree on this value"]')).toBeTruthy();
  });
});
