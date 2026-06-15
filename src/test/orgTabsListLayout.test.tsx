import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { Tabs } from '@/components/ui/tabs';

/**
 * v2.66.15 — Regression guard: the Organization Structure tabs row must use a
 * wrap-aware chip layout (`h-auto flex-wrap`) instead of the default
 * TabsList `h-10` height. The default fixed height clipped the second row of
 * chips when the page renders 11 tabs.
 *
 * Rendering the full OrgTabsList in isolation requires the whole Organization
 * page's data context; we instead snapshot the classNames we apply and assert
 * the structural intent. If the className contract changes, update both
 * `src/pages/admin/Organization.tsx::OrgTabsList` and this test together.
 */
const ORG_TABS_LIST_CLASSES =
  'h-auto flex flex-wrap gap-1 justify-start md:flex-nowrap md:overflow-x-auto md:[scrollbar-width:thin]';

describe('OrgTabsList layout contract', () => {
  it('does NOT use the default h-10 fixed height (would clip wrapped rows)', () => {
    expect(ORG_TABS_LIST_CLASSES).not.toMatch(/\bh-10\b/);
  });

  it('uses h-auto + flex-wrap so chips can grow to a second row on narrow widths', () => {
    expect(ORG_TABS_LIST_CLASSES).toMatch(/\bh-auto\b/);
    expect(ORG_TABS_LIST_CLASSES).toMatch(/\bflex-wrap\b/);
  });

  it('collapses to a single horizontal-scroll strip on md+ screens', () => {
    expect(ORG_TABS_LIST_CLASSES).toMatch(/\bmd:flex-nowrap\b/);
    expect(ORG_TABS_LIST_CLASSES).toMatch(/\bmd:overflow-x-auto\b/);
  });

  it('renders a TabsList container without throwing under these classes', () => {
    render(
      <Tabs defaultValue="a">
        <div data-testid="wrap" className={ORG_TABS_LIST_CLASSES}>tabs</div>
      </Tabs>,
    );
    expect(screen.getByTestId('wrap')).toHaveClass('h-auto', 'flex-wrap');
  });
});