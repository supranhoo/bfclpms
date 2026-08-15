/**
 * ADR-268 — BU Console compact layout regression guard.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConsoleMetricRow } from '@/components/admin/bu-console/ConsoleMetricRow';

describe('ConsoleMetricRow', () => {
  it('renders the title, metrics and is a single tap target when clickable', () => {
    render(
      <ConsoleMetricRow
        index={1}
        title="Asset Availability & Reliability"
        subtitle="2 mapped KPIs"
        metrics={[
          { label: 'KPI count', value: 2 },
          { label: 'Employee impact', value: 6 },
        ]}
        onClick={() => {}}
      />,
    );

    const row = screen.getByRole('button');
    expect(row).toHaveTextContent('Asset Availability & Reliability');
    expect(row).toHaveTextContent('2 mapped KPIs');
    expect(row.className).toContain('min-h-11');
    expect(screen.getByText('KPI count')).toBeInTheDocument();
    expect(screen.getByText('Employee impact')).toBeInTheDocument();
  });

  it('renders as a static row when no click handler is supplied', () => {
    render(<ConsoleMetricRow title="Static" />);
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.getByText('Static')).toBeInTheDocument();
  });
});