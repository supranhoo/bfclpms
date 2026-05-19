import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VariantScaleStrip } from './VariantScaleStrip';
import type { ScannerVariant } from '@/lib/scanGroupsDedup';

const base: ScannerVariant = {
  kra_name: 'Maintenance',
  kpi_name: 'Preventive Maintenance',
  employee_count: 1,
  row_count: 1,
  frequency: 'Monthly',
  criteria: 'Higher is Better',
  uom: '%',
  r0: '<98%', r1: '98%', r2: '98.5%', r3: '99%', r4: '99.5%', r5: '100%',
};

describe('VariantScaleStrip', () => {
  it('renders all scale cells with numeric values', () => {
    const { container } = render(<VariantScaleStrip variant={base} isBaseline />);
    expect(container.textContent).toContain('Monthly');
    expect(container.textContent).toContain('100%');
    expect(container.textContent).toContain('<98%');
    expect(container.textContent).toContain('Higher is Better');
  });

  it('shows em-dash for missing R values', () => {
    const v = { ...base, r0: null } as ScannerVariant;
    const { container } = render(<VariantScaleStrip variant={v} isBaseline />);
    expect(container.textContent).toContain('—');
  });

  it('highlights differing cells and shows differs chip vs baseline', () => {
    const other: ScannerVariant = { ...base, r0: '<95%', r5: '100%' };
    const { container, queryByText } = render(
      <VariantScaleStrip variant={other} baseline={base} />
    );
    expect(queryByText('differs')).toBeTruthy();
    const amber = container.querySelector('.bg-amber-50');
    expect(amber).toBeTruthy();
  });

  it('shows match chip when all cells equal baseline', () => {
    const same: ScannerVariant = { ...base };
    const { queryByText } = render(<VariantScaleStrip variant={same} baseline={base} />);
    expect(queryByText('match')).toBeTruthy();
  });

  it('renders mixed indicator dot when underlying KPIs disagree', () => {
    const v: ScannerVariant = { ...base, frequency_mixed: true };
    const { getAllByTestId } = render(<VariantScaleStrip variant={v} isBaseline />);
    expect(getAllByTestId('mixed-dot').length).toBeGreaterThan(0);
  });

  it('does not flag differs when baseline cell is missing', () => {
    const baseMissing: ScannerVariant = { ...base, r0: null };
    const v: ScannerVariant = { ...base, r0: '<98%' };
    const { queryByText } = render(<VariantScaleStrip variant={v} baseline={baseMissing} />);
    // Only r0 would differ, but baseline missing => no flag => match chip
    expect(queryByText('match')).toBeTruthy();
  });

  it('renders Binary-style tier labels verbatim', () => {
    const v: ScannerVariant = { ...base, criteria: 'Binary', uom: 'Yes/No', r0: 'No', r5: 'Yes', r1: null, r2: null, r3: null, r4: null };
    const { container } = render(<VariantScaleStrip variant={v} isBaseline />);
    expect(container.textContent).toContain('Yes');
    expect(container.textContent).toContain('No');
  });
});
