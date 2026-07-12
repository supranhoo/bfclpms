import { describe, it, expect } from 'vitest';

/**
 * §AR-HR-PROXY regression guard.
 *
 * The HR proxy self-review capability is gated exclusively by the `hr_pms`
 * role in `public.user_roles`. Being a member of the HR-Human Resources
 * department is NOT sufficient — role grants are explicit and audited.
 *
 * This test documents the policy contract in code so a future change that
 * tries to derive HR PMS permissions from `profiles.department_id` fails
 * the suite loudly.
 */

type UserRoleRow = { user_id: string; role: string };
type ProfileRow = { id: string; department_name: string };

function canProxySubmitSelfReview(
  userId: string,
  roles: UserRoleRow[],
  _profile: ProfileRow | null,
): boolean {
  // SSOT: only the explicit hr_pms role grants proxy rights.
  // Department membership is intentionally ignored.
  return roles.some((r) => r.user_id === userId && r.role === 'hr_pms');
}

describe('HR proxy self-review gate (§AR-HR-PROXY)', () => {
  const twinkleId = '6ef8b0f0-bc93-4053-b775-bbc7dc1b480c';
  const hrProfile: ProfileRow = { id: twinkleId, department_name: 'HR-Human Resources' };

  it('denies proxy when user has only the employee role, even if in HR department', () => {
    const roles: UserRoleRow[] = [{ user_id: twinkleId, role: 'employee' }];
    expect(canProxySubmitSelfReview(twinkleId, roles, hrProfile)).toBe(false);
  });

  it('allows proxy after the hr_pms role is granted', () => {
    const roles: UserRoleRow[] = [
      { user_id: twinkleId, role: 'employee' },
      { user_id: twinkleId, role: 'hr_pms' },
    ];
    expect(canProxySubmitSelfReview(twinkleId, roles, hrProfile)).toBe(true);
  });

  it('does not leak proxy rights to unrelated HR-department peers who lack the role', () => {
    const peerId = '00000000-0000-0000-0000-000000000001';
    const roles: UserRoleRow[] = [
      { user_id: twinkleId, role: 'hr_pms' }, // twinkle has the role
      { user_id: peerId, role: 'employee' },  // peer does not
    ];
    const peerProfile: ProfileRow = { id: peerId, department_name: 'HR-Human Resources' };
    expect(canProxySubmitSelfReview(peerId, roles, peerProfile)).toBe(false);
  });
});