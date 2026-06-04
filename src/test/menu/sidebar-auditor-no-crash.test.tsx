/**
 * CAPA invariant I2 — malformed `menu_overrides` / `menu_registry` rows
 * MUST NOT throw. The resolver coerces; the `<ErrorBoundary>` around
 * `SidebarContent` catches anything that escapes and renders the
 * "Menu temporarily simplified" fallback.
 */
import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ErrorBoundary } from '@/components/ui/ErrorBoundary';
import { applyOverrides } from '@/lib/menu/applyOverrides';
import type { MenuOverrideRow, MenuRegistryRow } from '@/lib/menu/types';

const SIDEBAR_SRC = readFileSync(
  join(process.cwd(), 'src/components/layout/AppSidebar.tsx'),
  'utf8',
);

function Boom(): JSX.Element {
  throw new Error('synthetic malformed-menu render error');
}

describe('CAPA I2 — auditor / malformed data must never crash the sidebar', () => {
  it('SidebarContent is wrapped in an ErrorBoundary with a simplified fallback', () => {
    expect(SIDEBAR_SRC).toMatch(/<ErrorBoundary[\s\S]{0,400}Menu temporarily simplified/);
  });

  it('AppSidebar still declares the Audit group label (auditor baseline)', () => {
    expect(SIDEBAR_SRC).toContain('label="Audit"');
  });

  it('ErrorBoundary catches a throwing child and renders the fallback', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const { getByText } = render(
      <ErrorBoundary fallback={<div>Menu temporarily simplified.</div>}>
        <Boom />
      </ErrorBoundary>,
    );
    expect(getByText(/Menu temporarily simplified/i)).toBeInTheDocument();
    spy.mockRestore();
  });

  it('applyOverrides does not throw on a malformed override referencing an unknown menu_key', () => {
    const registry: MenuRegistryRow[] = [
      {
        menu_key: 'audit-panel', default_label: 'Audit Panel', module_key: 'pms',
        default_parent_key: 'group-audit', menu_level: 2, route_path: '/dashboard?view=audit',
        icon_name: 'Shield', default_sort_order: 10, accepts_children: false,
        is_renamable: true, is_movable: true, is_cross_app_movable: false,
        is_system_required: true, feature_key: null, permission_key: 'audit-panel',
      },
    ];
    const overrides: MenuOverrideRow[] = [
      {
        id: 'x', menu_key: 'audit-panel', client_id: null,
        custom_label: null, custom_parent_key: 'ghost-parent',
        custom_sort_order: null, custom_menu_level: 999,
        custom_module_key: null, is_active: true, updated_by: null,
        updated_at: '2026-06-04T00:00:00Z',
      },
    ];
    expect(() => applyOverrides(registry, overrides)).not.toThrow();
    const resolved = applyOverrides(registry, overrides);
    expect(resolved).toHaveLength(1);
    expect(resolved[0].parent_key).toBeNull();
    expect(resolved[0].menu_level).toBeGreaterThanOrEqual(1);
    expect(resolved[0].menu_level).toBeLessThanOrEqual(4);
  });
});