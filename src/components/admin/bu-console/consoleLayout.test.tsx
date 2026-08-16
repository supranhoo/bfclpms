/**
 * ADR-277 — regression guard for the Performance Console layout polish.
 * Asserts the dense row keeps its name, metric values and button semantics,
 * and that the column header rail lists the same labels.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsoleMetricRow, ConsoleMetricHeader } from './ConsoleMetricRow';

describe('ConsoleMetricRow (ADR-277)', () => {
  it('exposes the title, metrics and a button role when clickable', () => {
    render(
      <ConsoleMetricRow
        index={1}
        title="Compliance to CLC norm"
        subtitle="1 mapped KPI"
        onClick={() => {}}
        hideMetricLabels
        metrics={[
          { label: 'KPI count', value: 1 },
          { label: 'Employee impact', value: 4 },
        ]}
      />,
    );
    const row = screen.getByRole('button');
    expect(row).toBeTruthy();
    expect(screen.getByText('Compliance to CLC norm')).toBeTruthy();
    expect(screen.getByText('1 mapped KPI')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('renders a non-interactive row without a button role', () => {
    render(<ConsoleMetricRow title="Static row" />);
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('renders the metric column header rail labels', () => {
    render(<ConsoleMetricHeader labels={['KPI count', 'Employee impact']} />);
    expect(screen.getByText('KPI count')).toBeTruthy();
    expect(screen.getByText('Employee impact')).toBeTruthy();
    expect(screen.getByText('Name')).toBeTruthy();
  });
});

describe('KRA disclosure (ADR-278)', () => {
  it('marks an expandable row with aria-expanded and rotates the chevron', () => {
    const { rerender } = render(
      <ConsoleMetricRow title="Customer Portfolio Expansion" onClick={() => {}} expandable ariaControls="p1" />,
    );
    expect(screen.getByRole('button').getAttribute('aria-expanded')).toBe('false');

    rerender(
      <ConsoleMetricRow
        title="Customer Portfolio Expansion"
        onClick={() => {}}
        expandable
        expanded
        ariaControls="p1"
      />,
    );
    const row = screen.getByRole('button');
    expect(row.getAttribute('aria-expanded')).toBe('true');
    expect(row.getAttribute('aria-controls')).toBe('p1');
    expect(row.querySelector('svg')?.getAttribute('class')).toContain('rotate-90');
  });
});
