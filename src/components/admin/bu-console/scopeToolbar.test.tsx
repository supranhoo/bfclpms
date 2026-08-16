/**
 * ADR-283 — the scope toolbar may shrink to a summary chip to give the data
 * area more room, but it must never hide the "Apply filters" call to action
 * while the selections are dirty.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ScopeToolbar } from './ScopeToolbar';

/** Drives the collapse sentinel: `visible=false` means the user has scrolled. */
function mockObserver(visible: boolean) {
  const cbs: ((e: { isIntersecting: boolean }[]) => void)[] = [];
  (globalThis as any).IntersectionObserver = class {
    constructor(cb: any) { cbs.push(cb); }
    observe() { cbs.forEach(cb => cb([{ isIntersecting: visible }])); }
    disconnect() {}
  };
}

const baseProps = {
  period: 'August',
  year: 2026,
  onPeriodChange: () => {},
  onYearChange: () => {},
  filters: [
    {
      key: 'bu',
      label: 'Business Units',
      placeholder: 'All business units',
      values: ['a'],
      onValuesChange: () => {},
      options: [{ value: 'a', label: 'CPP' }],
    },
  ],
  onApply: () => {},
  onRefresh: () => {},
};

describe('ScopeToolbar collapse (ADR-283)', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('collapses to the summary chip once scrolled with a clean loaded scope', () => {
    mockObserver(false);
    render(<ScopeToolbar {...baseProps} hasScope summary="August 2026 · CPP" />);
    expect(screen.getByText(/August 2026 · CPP/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Change' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Refresh console data' })).toBeTruthy();
  });

  it('stays expanded while the filters are dirty so Apply remains visible', () => {
    mockObserver(false);
    render(<ScopeToolbar {...baseProps} hasScope isDirty summary="August 2026 · CPP" />);
    expect(screen.getByRole('button', { name: 'Apply filters' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull();
  });

  it('stays expanded at the top of the page', () => {
    mockObserver(true);
    render(<ScopeToolbar {...baseProps} hasScope summary="August 2026 · CPP" />);
    expect(screen.getByRole('button', { name: 'Load console' })).toBeTruthy();
  });
});