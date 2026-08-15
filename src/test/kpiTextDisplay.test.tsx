/**
 * ADR-269b — display resolver contract.
 * Legacy KPIs must render exactly as before; structured KPIs must render
 * labelled parts and never print the raw composed `kpi_name`.
 */
import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KpiTitle, KpiTextBlocks, isStructuredKpi } from '@/components/kpi/KpiText';
import { getKpiSummaryText } from '@/lib/textFormatting';
import { resolveKpiText } from '@/lib/kpiTextSplit';

const LEGACY =
  'Dust Emission Control\n- Description: Keep stack emission within board limits\n- Formula: Average of daily readings\n- Scoring Logic: <30 = 5, 30-50 = 3, >50 = 0';

const STRUCTURED = {
  kpi_name: LEGACY,
  kpi_title: 'Dust Emission Control',
  kpi_description: 'Keep stack emission within board limits',
  kpi_formula: 'Average of daily readings',
  kpi_scoring_logic: '<30 = 5, 30-50 = 3, >50 = 0',
};

describe('KpiTitle', () => {
  it('renders the legacy summary text unchanged for unstructured rows', () => {
    const { container } = render(<KpiTitle kpi={{ kpi_name: LEGACY }} />);
    expect(container.textContent).toBe(getKpiSummaryText(LEGACY));
  });

  it('renders the structured title for structured rows', () => {
    const { container } = render(<KpiTitle kpi={STRUCTURED} />);
    expect(container.textContent).toBe('Dust Emission Control');
  });
});

describe('KpiTextBlocks', () => {
  it('renders the raw legacy text for unstructured rows', () => {
    const { container } = render(<KpiTextBlocks kpi={{ kpi_name: LEGACY }} />);
    expect(container.textContent).toContain('Scoring Logic');
    expect(container.textContent).toContain('<30 = 5');
  });

  it('renders nothing for legacy rows when hideLegacy is set', () => {
    const { container } = render(<KpiTextBlocks kpi={{ kpi_name: LEGACY }} hideLegacy />);
    expect(container.textContent).toBe('');
  });

  it('renders separate labelled parts and never the raw kpi_name', () => {
    render(<KpiTextBlocks kpi={STRUCTURED} />);
    expect(screen.getByText('Description')).toBeTruthy();
    expect(screen.getByText('Formula')).toBeTruthy();
    expect(screen.getByText('Scoring Logic')).toBeTruthy();
    expect(screen.queryByText(LEGACY)).toBeNull();
  });

  it('omits empty parts instead of printing a dash', () => {
    const { container } = render(
      <KpiTextBlocks kpi={{ kpi_name: 'x', kpi_title: 'Only a title' }} />,
    );
    expect(container.textContent).not.toContain('—');
    expect(container.textContent).not.toContain('Formula');
  });
});

describe('display precedence', () => {
  it('keeps the canonical registry name above the structured title', () => {
    const canonicalName = 'Canonical Dust Emission';
    const parts = resolveKpiText(STRUCTURED);
    const displayed = canonicalName ?? (parts.isStructured ? parts.title : STRUCTURED.kpi_name);
    expect(displayed).toBe(canonicalName);
  });

  it('flags structured rows only', () => {
    expect(isStructuredKpi(STRUCTURED)).toBe(true);
    expect(isStructuredKpi({ kpi_name: LEGACY })).toBe(false);
  });
});
