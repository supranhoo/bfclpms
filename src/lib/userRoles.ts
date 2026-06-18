/**
 * Functional role helpers.
 *
 * RCA (Jun-2026): UserManagement was doing
 *   UPDATE user_roles SET role = :new WHERE user_id = :uid
 * which collided with the UNIQUE(user_id, role) constraint whenever a user
 * had more than one row (e.g. admin + platform_owner).
 *
 * All functional role writes MUST go through `setFunctionalRole`, which calls
 * the SECURITY DEFINER RPC `public.set_functional_role`. The RPC:
 *   - replaces ONLY the functional-role row(s) for that user
 *   - PRESERVES platform_owner / implementation_admin assignments
 *   - is a no-op when the user already has exactly this functional role
 */
import { supabase } from '@/integrations/supabase/client';
import type { AppRole } from '@/lib/roles';

export const FUNCTIONAL_ROLES = [
  'admin',
  'manager',
  'employee',
  'auditor',
  'management',
  'hr_pms',
  'skip_level',
] as const;

export type FunctionalRole = typeof FUNCTIONAL_ROLES[number];

export function isFunctionalRole(role: string): role is FunctionalRole {
  return (FUNCTIONAL_ROLES as readonly string[]).includes(role);
}

export async function setFunctionalRole(userId: string, newRole: AppRole): Promise<void> {
  if (!isFunctionalRole(newRole)) {
    throw new Error(
      `setFunctionalRole only manages functional roles. "${newRole}" is a platform-tier role and must be granted via the Identity & Access Console.`
    );
  }
  const { error } = await (supabase as any).rpc('set_functional_role', {
    p_user_id: userId,
    p_new_role: newRole,
  });
  if (error) throw error;
}