/**
 * ADR-093 — Incentive Dry-Run preview must be programme-type aware.
 *
 * Repro (Upendra, 2026-06-29): Metal Sizing (production-based) preview
 * showed N/A in PMS Score, Base %, Final % for every row, even though
 * Amount and Total Amount were correct. Root cause: compute-monthly-
 * incentives intentionally writes pms_score: null for production rows
 * (see edge fn index.ts:708) — production incentive is tons × rate,
 * not a PMS-driven percentage. UI was rendering the support-programme
 * layout for every programme type.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IncentiveDryRunDialog } from '@/components/incentive/IncentiveDryRunDialog';

const baseResult = {
  computed: 1,
  program: 'Metal Sizing',
  summary: { total: 1, eligible: 1, disqualified: 0, avg_incentive_percent: 0, total_amount: 2453 },
  records: [
    {
      employee_id: 'emp-1',
      pms_score: null,
      base_incentive_percent: 0,
      is_disqualified: false,
      disqualification_reasons: null,
      lti_penalty_percent: 0,
      pro_rata_factor: 1,
      final_incentive_percent: 0,
      production_value: 24.53,
      incentive_amount: 2453,
      payment_period: '11-20',
    },
  ],
};

describe('IncentiveDryRunDialog — production programme layout (ADR-093)', () => {
  it('renders tons/rate/amount and footnote for production diagnostics', () => {
    render(
      <IncentiveDryRunDialog
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        isConfirming={false}
        result={{ ...baseResult, diagnostics: { detected_program_type: 'production' } } as any}
      />,
    );
    expect(screen.getByText('Production (tons)')).toBeInTheDocument();
    expect(screen.getByText(/Rate \(₹\/ton\)/)).toBeInTheDocument();
    expect(screen.getByText('24.53')).toBeInTheDocument();
    // 2453 / 24.53 = 100
    expect(screen.getByText(/₹100/)).toBeInTheDocument();
    expect(screen.getByText('₹2,453')).toBeInTheDocument();
    expect(screen.getByTestId('production-footnote')).toBeInTheDocument();
    // PMS-centric columns must not be rendered for production
    expect(screen.queryByText('PMS Score')).not.toBeInTheDocument();
    expect(screen.queryByText('Base %')).not.toBeInTheDocument();
    expect(screen.queryByText('Final %')).not.toBeInTheDocument();
  });

  it('falls back to the legacy PMS-centric layout for support programmes (regression guard)', () => {
    render(
      <IncentiveDryRunDialog
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        isConfirming={false}
        result={
          {
            ...baseResult,
            program: 'Support Bonus',
            records: [{ ...baseResult.records[0], pms_score: 4.2, base_incentive_percent: 10, final_incentive_percent: 10 }],
            diagnostics: { detected_program_type: 'support' },
          } as any
        }
      />,
    );
    expect(screen.getByText('PMS Score')).toBeInTheDocument();
    expect(screen.getByText('Base %')).toBeInTheDocument();
    expect(screen.getByText('Final %')).toBeInTheDocument();
    expect(screen.queryByText('Production (tons)')).not.toBeInTheDocument();
    expect(screen.queryByTestId('production-footnote')).not.toBeInTheDocument();
  });

  it('renders "—" for Rate when production_value is zero (no divide-by-zero)', () => {
    render(
      <IncentiveDryRunDialog
        open
        onOpenChange={() => {}}
        onConfirm={() => {}}
        isConfirming={false}
        result={
          {
            ...baseResult,
            records: [{ ...baseResult.records[0], production_value: 0, incentive_amount: 0 }],
            diagnostics: { detected_program_type: 'production' },
          } as any
        }
      />,
    );
    // tons cell, rate cell, amount cell all render as "—"
    const dashes = screen.getAllByText('—');
    expect(dashes.length).toBeGreaterThanOrEqual(3);
  });
});