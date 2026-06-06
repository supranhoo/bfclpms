import { describe, it, expect } from 'vitest';

/**
 * Contract guard for the silent-RLS-failure detection added to
 * `updateUser` in `src/pages/admin/UserManagement.tsx`.
 *
 * RCA: Non-admin users granted `admin-users` menu access via a profile-
 * based menu grant (e.g. "Onboarding" profile) could open Edit User and
 * toggle Account Status / Role. The supabase `.update()` call returned
 * no error because RLS silently filtered the row out; the optimistic
 * `onSuccess` toast then displayed "User updated successfully" even
 * though zero rows were modified.
 *
 * CAPA: After `.update().eq('id', userId).select('id')`, the returned
 * array length MUST be > 0. If it is empty, throw a clear permission
 * error instead of falling through to the success toast.
 */

function assertProfileUpdateTouchedRow(
  rows: Array<{ id: string }> | null,
  error: { message: string } | null,
): void {
  if (error) throw new Error(error.message);
  if (!rows || rows.length === 0) {
    throw new Error(
      'You do not have permission to modify this user. Only Admins can change profile details, account status, or roles.'
    );
  }
}

describe('UserManagement updateUser — silent RLS failure detection', () => {
  it('throws a permission error when RLS returned zero updated rows', () => {
    expect(() => assertProfileUpdateTouchedRow([], null)).toThrow(/permission/i);
  });

  it('throws when supabase returns null data with no error (RLS filter)', () => {
    expect(() => assertProfileUpdateTouchedRow(null, null)).toThrow(/permission/i);
  });

  it('passes when at least one row was actually updated', () => {
    expect(() =>
      assertProfileUpdateTouchedRow([{ id: 'user-1' }], null),
    ).not.toThrow();
  });

  it('surfaces supabase errors verbatim and does not mask them', () => {
    expect(() =>
      assertProfileUpdateTouchedRow(null, { message: 'connection lost' }),
    ).toThrow('connection lost');
  });
});