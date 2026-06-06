/**
 * BUG fix invariant — when `menu_overrides_enabled = false`, the sidebar
 * MUST still honour per-user overrides and access-profile rights via
 * `canAccess`. The kill switch only governs the resolver/parent-move tree,
 * not access grants.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src/components/layout/AppSidebar.tsx'),
  'utf8',
);

describe('AppSidebar.filterByRole — grant-aware regardless of kill switch', () => {
  it('does NOT early-return on overridesEnabled === false (would discard grants)', () => {
    const fn = SRC.match(/const filterByRole = useCallback\([\s\S]*?\}, \[effectiveRole[^\]]*\]\);/)![0];
    expect(fn).not.toMatch(/overridesEnabled\s*===\s*false[\s\S]{0,80}return\s+Array\.isArray/);
  });

  it('uses a layered check: static role match OR canAccess(menuKey)', () => {
    const fn = SRC.match(/const filterByRole = useCallback\([\s\S]*?\}, \[effectiveRole[^\]]*\]\);/)![0];
    expect(fn).toMatch(/staticMatch/);
    expect(fn).toMatch(/canAccess\(item\.menuKey\)/);
  });

  it('Data Entry duplicates are pinned to admin in the static role list (grant-driven for others)', () => {
    const dataEntryBlock = SRC.match(/dataEntry:\s*\[[\s\S]*?\],/)![0];
    // Both items present
    expect(dataEntryBlock).toMatch(/menuKey:\s*'data-entry'/);
    expect(dataEntryBlock).toMatch(/menuKey:\s*'admin-incentive-data'/);
    // Neither item should hand a free pass to manager / auditor / employee via static roles
    expect(dataEntryBlock).not.toMatch(/roles:\s*\[[^\]]*'manager'/);
    expect(dataEntryBlock).not.toMatch(/roles:\s*\[[^\]]*'auditor'/);
    expect(dataEntryBlock).not.toMatch(/roles:\s*\[[^\]]*'employee'/);
  });
});