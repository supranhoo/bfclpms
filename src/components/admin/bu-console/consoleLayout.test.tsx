/**
 * ADR-277 — regression guard for the Performance Console layout polish.
 * Asserts the dense row keeps its name, metric values and button semantics,
 * and that the column header rail lists the same labels.
 */
import { describe, it, expect } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ConsoleMetricRow, ConsoleMetricHeader } from './ConsoleMetricRow';
import { ConsoleStatBand, computeConsoleStats } from './ConsoleStatBand';
import { scoreBand } from './ScorePill';
import { BuConsoleTree } from './BuConsoleTree';
import { MergeProposalsTab } from './MergeProposalsTab';

vi.mock('@/hooks/useBuConsoleCapability', () => ({
  useBuConsoleCapability: () => ({ canWrite: true }),
}));

vi.mock('@/hooks/useBuConsole', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useBuConsole')>();
  return {
    ...actual,
    useMergeProposals: () => ({
      data: {
        rows: [
          {
            id: 'p1',
            category_id: 'cat-1',
            canonical_kra_name: 'Power generation and thermal efficiency for captive power plant operations',
            canonical_kpi_name: 'Power generation from 45 MWh/WHRB',
            variant_kra_name: 'Power generation and thermal efficiency for captive power plant operations',
            variant_kpi_name:
              'Power generation from 45 MWh/WHRB - Description: daily power generated from waste heat recovery boiler with formula and scoring logic appended for operators',
            match_type: 'fuzzy',
            similarity: 0.96,
            affected_kpi_count: 3,
            affected_employee_count: 27,
          },
        ],
        total: 1,
        page_size: 200,
        page: 1,
      },
      isLoading: false,
    }),
    useGenerateMergeProposals: () => ({ mutate: vi.fn(), isPending: false, error: null }),
    useDecideMergeProposal: () => ({ mutate: vi.fn(), isPending: false }),
    useDecideMergeProposalsBulk: () => ({ mutate: vi.fn(), isPending: false }),
  };
});

const tree = [
  {
    category_id: 'c1',
    category_name: 'Production',
    kra_count: 1,
    kpi_count: 1,
    kras: [
      {
        kra_key: 'kra-1',
        kra_name: 'Power generation',
        kpi_count: 1,
        kpis: [
          {
            kpi_key: 'k1',
            kpi_name: 'Dust emission',
            kpi_title: 'Dust emission',
            employee_count: 3,
            avg_score: 4,
            variants: [],
          },
        ],
      },
    ],
  },
] as any;

describe('Console single surface (ADR-289 / ADR-297)', () => {
  const noop = () => {};

  it('shows the KPI definition list inside the open KRA in configure mode', () => {
    render(
      <BuConsoleTree
        categories={tree}
        selectedCategoryId="c1"
        selectedKraKey="kra-1"
        onSelectCategory={noop}
        onSelectKra={noop}
        onSelectKpi={noop}
      />,
    );
    // The KPI panel header only exists when the definition list is rendered.
    expect(screen.getByText('KPIs · 1')).toBeTruthy();
    expect(screen.getAllByText('Dust emission').length).toBeGreaterThan(0);
  });

  it('opens the people cells inside the KPI row, never as a second KPI list', () => {
    render(
      <BuConsoleTree
        categories={tree}
        selectedCategoryId="c1"
        selectedKraKey="kra-1"
        onSelectCategory={noop}
        onSelectKra={noop}
        onSelectKpi={noop}
        renderKpiPanel={(kpi, kra, categoryId) => (
          <div>people for {kpi.kpi_name} · {kra.kra_name} · {categoryId}</div>
        )}
      />,
    );
    // The KPI title is printed by exactly one row — no duplicate worksheet list.
    const titles = () =>
      screen.getAllByText('Dust emission').filter(el => el.tagName.toLowerCase() === 'p');
    expect(titles()).toHaveLength(1);
    expect(screen.queryByText(/^people for/)).toBeNull();

    fireEvent.click(titles()[0]);
    expect(screen.getByText('people for Dust emission · Power generation · c1')).toBeTruthy();
    expect(titles()).toHaveLength(1);
  });
});

describe('Variant badge (ADR-315a)', () => {
  const noop = () => {};
  const treeWith = (over: Record<string, unknown>) => [
    {
      ...tree[0],
      kras: [{ ...tree[0].kras[0], kpis: [{ ...tree[0].kras[0].kpis[0], ...over }] }],
    },
  ] as any;

  const renderTree = (over: Record<string, unknown>) =>
    render(
      <BuConsoleTree
        categories={treeWith(over)}
        selectedCategoryId="c1"
        selectedKraKey="kra-1"
        onSelectCategory={noop}
        onSelectKra={noop}
        onSelectKpi={noop}
      />,
    );

  it('stays silent for a single definition, whatever the weightage spread', () => {
    renderTree({ variant_count: 1, weightage_values: [10, 12, 15] });
    expect(screen.queryByText(/variant/i)).toBeNull();
    // ADR-346 — a weightage spread is drill-down detail, not a tree badge.
    expect(screen.queryByText('3 values')).toBeNull();
  });

  it('stays silent when the KPI reports no variant count at all', () => {
    renderTree({ weightage_values: [10, 25] });
    expect(screen.queryByText(/variant/i)).toBeNull();
  });

  it('warns once there really is more than one definition', () => {
    renderTree({ variant_count: 3, weightage_values: [10] });
    expect(screen.getByText('3 variants')).toBeTruthy();
  });
});

describe('Duplicate KPI merge queue layout (ADR-314)', () => {
  it('uses wrap-safe containers instead of truncation-only rows', () => {
    render(
      <MemoryRouter>
        <MergeProposalsTab />
      </MemoryRouter>,
    );

    const card = screen.getByText('Duplicate KPI merge queue').closest('.min-w-0');
    expect(card).toBeTruthy();
    expect(screen.getByText(/Description: daily power generated/)).toHaveClass('break-words');
    expect(screen.getByText('Power generation from 45 MWh/WHRB')).toHaveClass('break-words');
  });
});

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

describe('Console stat band + score bands (ADR-279)', () => {
  it('aggregates the loaded tree and uses the distinct employee total (ADR-281)', () => {
    const stats = computeConsoleStats(
      [
      {
        kra_count: 2,
        kpi_count: 3,
        kras: [
          { kpis: [{ employee_count: 4, avg_score: 5 }, { employee_count: 2, avg_score: null }] },
          { kpis: [{ employee_count: 1, avg_score: 3 }] },
        ],
      },
      ],
      5,
    );
    // 4+2+1 = 7 KPI-row memberships, but only 5 distinct people.
    expect(stats).toEqual({ categories: 1, kras: 2, kpis: 3, employees: 5, avgScore: 4 });
  });

  it('renders the stat tiles with their counts', () => {
    render(
      <ConsoleStatBand
        variant="tiles"
        stats={{ categories: 1, kras: 2, kpis: 3, employees: 7, avgScore: 4 }}
        scopeLabel="July 2026"
      />,
    );
    expect(screen.getByText('Categories')).toBeTruthy();
    expect(screen.getByText('Employees impacted')).toBeTruthy();
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('4.00')).toBeTruthy();
  });

  it('renders every metric on one line in the strip variant (ADR-283)', () => {
    render(
      <ConsoleStatBand
        stats={{ categories: 1, kras: 2, kpis: 3, employees: 7, avgScore: 4 }}
        scopeLabel="July 2026"
      />,
    );
    for (const label of ['Categories', 'KRAs', 'KPIs', 'Employees', 'Avg score']) {
      expect(screen.getByText(label)).toBeTruthy();
    }
    // The distinct server total is shown, never a per-KPI sum.
    expect(screen.getByText('7')).toBeTruthy();
    expect(screen.getByText('4.00')).toBeTruthy();
  });

  it('bands scores against the review scale', () => {
    expect(scoreBand(null)).toBe('none');
    expect(scoreBand(1.5)).toBe('low');
    expect(scoreBand(3.2)).toBe('mid');
    expect(scoreBand(4.6)).toBe('high');
  });
});
