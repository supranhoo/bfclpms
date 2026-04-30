/**
 * IAC service layer. All Supabase access for the Identity & Access
 * Console funnels through here so UI components stay lean and the
 * data contract has one place to evolve.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  IacAssignment,
  IacAuditEntry,
  IacBulkAssignmentRow,
  IacBulkPreview,
  IacCapability,
  IacRole,
  IacRoleWithCaps,
  IacScopeType,
} from './types';

// -------- Capabilities --------------------------------------------------
export async function listCapabilities(): Promise<IacCapability[]> {
  const { data, error } = await supabase
    .from('iac_capabilities')
    .select('code, module, label, description, is_destructive')
    .order('module')
    .order('code');
  if (error) throw error;
  return (data ?? []) as IacCapability[];
}

// -------- Roles ---------------------------------------------------------
export async function listRoles(includeInactive = false): Promise<IacRole[]> {
  let q = supabase
    .from('iac_roles')
    .select('id, code, name, module, description, is_system, is_active')
    .order('module')
    .order('name');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as IacRole[];
}

export async function listRolesWithCapabilities(): Promise<IacRoleWithCaps[]> {
  const [roles, mappingRes] = await Promise.all([
    listRoles(true),
    supabase.from('iac_role_capabilities').select('role_id, capability_code'),
  ]);
  if (mappingRes.error) throw mappingRes.error;
  const byRole = new Map<string, string[]>();
  (mappingRes.data ?? []).forEach((r: { role_id: string; capability_code: string }) => {
    const arr = byRole.get(r.role_id) ?? [];
    arr.push(r.capability_code);
    byRole.set(r.role_id, arr);
  });
  return roles.map((r) => ({ ...r, capabilities: byRole.get(r.id) ?? [] }));
}

export async function setRoleCapabilities(roleId: string, capabilityCodes: string[]) {
  // Replace strategy: clear then insert (small N, simple semantics).
  const del = await supabase.from('iac_role_capabilities').delete().eq('role_id', roleId);
  if (del.error) throw del.error;
  if (capabilityCodes.length) {
    const ins = await supabase
      .from('iac_role_capabilities')
      .insert(capabilityCodes.map((c) => ({ role_id: roleId, capability_code: c })));
    if (ins.error) throw ins.error;
  }
  await audit('role.capabilities.set', 'role', roleId, { capabilities: capabilityCodes });
}

export async function createRole(input: {
  code: string;
  name: string;
  module: string;
  description?: string;
  capabilities?: string[];
}) {
  const { data, error } = await supabase
    .from('iac_roles')
    .insert({
      code: input.code,
      name: input.name,
      module: input.module,
      description: input.description ?? null,
      is_system: false,
      is_active: true,
    })
    .select('id')
    .single();
  if (error) throw error;
  if (input.capabilities?.length) {
    await setRoleCapabilities(data.id, input.capabilities);
  }
  await audit('role.create', 'role', data.id, { code: input.code, name: input.name });
  return data.id as string;
}

export async function deactivateRole(roleId: string) {
  const { error } = await supabase
    .from('iac_roles')
    .update({ is_active: false })
    .eq('id', roleId);
  if (error) throw error;
  await audit('role.deactivate', 'role', roleId);
}

// -------- Assignments ---------------------------------------------------
export async function listAssignments(): Promise<IacAssignment[]> {
  const { data, error } = await supabase
    .from('iac_user_role_assignments')
    .select('id, user_id, role_id, scope_type, scope_id, assigned_by, assigned_at, expires_at')
    .order('assigned_at', { ascending: false })
    .limit(2000);
  if (error) throw error;
  return (data ?? []) as IacAssignment[];
}

export async function grantRole(input: {
  user_id: string;
  role_id: string;
  scope_type?: IacScopeType;
  scope_id?: string | null;
  expires_at?: string | null;
}) {
  const { error } = await supabase.from('iac_user_role_assignments').insert({
    user_id: input.user_id,
    role_id: input.role_id,
    scope_type: input.scope_type ?? 'global',
    scope_id: input.scope_id ?? null,
    expires_at: input.expires_at ?? null,
  });
  if (error) throw error;
  await audit('assignment.grant', 'assignment', `${input.user_id}:${input.role_id}`, {
    user_id: input.user_id,
    role_id: input.role_id,
    scope_type: input.scope_type ?? 'global',
    scope_id: input.scope_id ?? null,
    expires_at: input.expires_at ?? null,
  });
}

export async function revokeAssignment(id: string) {
  const { error } = await supabase.from('iac_user_role_assignments').delete().eq('id', id);
  if (error) throw error;
  await audit('assignment.revoke', 'assignment', id);
}

// -------- Audit ---------------------------------------------------------
export async function audit(
  action: string,
  target_type: string,
  target_id: string | null,
  payload: Record<string, unknown> = {},
) {
  // Fire-and-forget: failures here must not block the user action.
  await supabase.rpc('iac_log', {
    _action: action,
    _target_type: target_type,
    _target_id: target_id ?? '',
    _payload: payload as never,
  });
}

export async function listAudit(limit = 200): Promise<IacAuditEntry[]> {
  const { data, error } = await supabase
    .from('iac_audit_log')
    .select('id, actor_id, action, target_type, target_id, payload, created_at')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as IacAuditEntry[];
}

// -------- Bulk import ---------------------------------------------------
export async function previewBulk(rows: IacBulkAssignmentRow[]): Promise<IacBulkPreview> {
  const emails = Array.from(new Set(rows.map((r) => r.email.trim().toLowerCase()))).filter(Boolean);
  const roleCodes = Array.from(new Set(rows.map((r) => r.role_code.trim()))).filter(Boolean);

  const [profilesRes, rolesRes, assignsRes] = await Promise.all([
    supabase.from('profiles').select('id, email').in('email', emails),
    supabase.from('iac_roles').select('id, code').in('code', roleCodes),
    supabase
      .from('iac_user_role_assignments')
      .select('user_id, role_id, scope_type, scope_id'),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (rolesRes.error) throw rolesRes.error;
  if (assignsRes.error) throw assignsRes.error;

  const profileByEmail = new Map<string, string>(
    (profilesRes.data ?? []).map((p) => [String(p.email).toLowerCase(), p.id as string]),
  );
  const roleByCode = new Map<string, string>(
    (rolesRes.data ?? []).map((r) => [r.code as string, r.id as string]),
  );
  const existing = new Set<string>(
    (assignsRes.data ?? []).map(
      (a: { user_id: string; role_id: string; scope_type: string; scope_id: string | null }) =>
        `${a.user_id}|${a.role_id}|${a.scope_type}|${a.scope_id ?? ''}`,
    ),
  );

  const out: IacBulkPreview = { ok: [], unknownUsers: [], unknownRoles: [], duplicates: [] };
  for (const r of rows) {
    const userId = profileByEmail.get(r.email.trim().toLowerCase());
    const roleId = roleByCode.get(r.role_code.trim());
    if (!userId) { out.unknownUsers.push(r); continue; }
    if (!roleId) { out.unknownRoles.push(r); continue; }
    const key = `${userId}|${roleId}|${r.scope_type ?? 'global'}|${r.scope_id ?? ''}`;
    if (existing.has(key)) { out.duplicates.push(r); continue; }
    out.ok.push(r);
  }
  return out;
}

export async function applyBulk(rows: IacBulkAssignmentRow[]): Promise<{ inserted: number }> {
  if (rows.length === 0) return { inserted: 0 };
  const emails = Array.from(new Set(rows.map((r) => r.email.trim().toLowerCase())));
  const codes = Array.from(new Set(rows.map((r) => r.role_code.trim())));

  const [profilesRes, rolesRes] = await Promise.all([
    supabase.from('profiles').select('id, email').in('email', emails),
    supabase.from('iac_roles').select('id, code').in('code', codes),
  ]);
  if (profilesRes.error) throw profilesRes.error;
  if (rolesRes.error) throw rolesRes.error;
  const profileByEmail = new Map<string, string>(
    (profilesRes.data ?? []).map((p) => [String(p.email).toLowerCase(), p.id as string]),
  );
  const roleByCode = new Map<string, string>(
    (rolesRes.data ?? []).map((r) => [r.code as string, r.id as string]),
  );

  const payload = rows
    .map((r) => {
      const user_id = profileByEmail.get(r.email.trim().toLowerCase());
      const role_id = roleByCode.get(r.role_code.trim());
      if (!user_id || !role_id) return null;
      return {
        user_id,
        role_id,
        scope_type: (r.scope_type ?? 'global') as IacScopeType,
        scope_id: r.scope_id ?? null,
        expires_at: r.expires_at ?? null,
      };
    })
    .filter((x): x is {
      user_id: string;
      role_id: string;
      scope_type: IacScopeType;
      scope_id: string | null;
      expires_at: string | null;
    } => x !== null);

  if (!payload.length) return { inserted: 0 };
  const { error } = await supabase.from('iac_user_role_assignments').insert(payload);
  if (error) throw error;
  await audit('assignment.bulk_grant', 'assignment', null, { count: payload.length });
  return { inserted: payload.length };
}

// -------- People (search) ----------------------------------------------
export interface IacPerson {
  id: string;
  full_name: string | null;
  email: string;
  employee_code: string | null;
  is_active: boolean;
}

export async function searchPeople(term: string, limit = 50): Promise<IacPerson[]> {
  let q = supabase
    .from('profiles')
    .select('id, full_name, email, employee_code, is_active')
    .order('full_name')
    .limit(limit);
  if (term.trim()) {
    const t = term.trim();
    q = q.or(`full_name.ilike.%${t}%,email.ilike.%${t}%,employee_code.ilike.%${t}%`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as IacPerson[];
}