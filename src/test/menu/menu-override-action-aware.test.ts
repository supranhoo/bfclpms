/**
 * ADR-350 / CAPA — menu_access_user_overrides must be action-aware.
 * A visibility override (can_view implied by row existence) must NOT grant
 * add/update/delete unless the matching action flag is true.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = readFileSync(
  join(process.cwd(), 'src/hooks/useMenuAccess.ts'),
  'utf8',
);

describe('ADR-350 — action-aware menu override contract', () => {
  it('MenuAccessUserOverride interface carries can_add/can_update/can_delete', () => {
    expect(SRC).toMatch(/can_add:\s*boolean/);
    expect(SRC).toMatch(/can_update:\s*boolean/);
    expect(SRC).toMatch(/can_delete:\s*boolean/);
  });

  it('canPerform checks action-scoped override flags before granting write', () => {
    // It must look up the override and then branch on the requested action.
    expect(SRC).toMatch(/userOverrides\.find\(o\s*=>\s*o\.menu_key\s*===\s*menuKey\s*&&\s*o\.user_id\s*===\s*user\.id\)/);
    expect(SRC).toMatch(/case\s+'add':\s*return\s+override\.can_add;/);
    expect(SRC).toMatch(/case\s+'update':\s*return\s+override\.can_update;/);
    expect(SRC).toMatch(/case\s+'delete':\s*return\s+override\.can_delete;/);
  });

  it('grantUserMenuAccess persists explicit action flags (defaults secure/view-only)', () => {
    expect(SRC).toMatch(/canAdd\?\s*:\s*boolean/);
    expect(SRC).toMatch(/canUpdate\?\s*:\s*boolean/);
    expect(SRC).toMatch(/canDelete\?\s*:\s*boolean/);
    expect(SRC).toMatch(/can_add:\s*canAdd/);
    expect(SRC).toMatch(/can_update:\s*canUpdate/);
    expect(SRC).toMatch(/can_delete:\s*canDelete/);
  });

  it('defaults for new overrides are view-only (secure by default)', () => {
    expect(SRC).toMatch(/canAdd\s*=\s*false/);
    expect(SRC).toMatch(/canUpdate\s*=\s*false/);
    expect(SRC).toMatch(/canDelete\s*=\s*false/);
  });
});
