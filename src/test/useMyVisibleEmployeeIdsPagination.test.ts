import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

// Regression: PostgREST hard-caps single RPC responses at 1000 rows.
// Avinash Kumar (101732) owns the "Onboarding" access profile whose
// scope returns 2,571 visible employees; an unpaged
// `supabase.rpc('get_user_management_visible_employee_ids')` silently
// returned only the first 1000 IDs, hiding employee 102028 from the
// User Management roster. The hook MUST page this RPC.
describe('useMyVisibleEmployeeIds', () => {
  const src = readFileSync(
    join(process.cwd(), 'src/hooks/useMyVisibleEmployeeIds.ts'),
    'utf-8',
  );

  it('uses fetchAllRpcPaged to bypass the 1000-row PostgREST cap', () => {
    expect(src).toMatch(/fetchAllRpcPaged/);
    expect(src).toMatch(/get_user_management_visible_employee_ids/);
    expect(src).toMatch(/\.range\(from, to\)/);
  });

  it('does not call the RPC unpaged (single .rpc(...) await)', () => {
    // Forbid the exact pattern that hits the cap.
    expect(src).not.toMatch(
      /await\s+supabase\.rpc\(\s*['"]get_user_management_visible_employee_ids['"]/,
    );
  });
});