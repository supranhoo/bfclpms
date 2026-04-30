/**
 * IAC service layer. All Supabase access for the Identity & Access
 * Console funnels through here so UI components stay lean and the
 * data contract has one place to evolve.
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';
import type {
  IacAssignment,
  IacAuditEntry,
  IacBulkAssignmentRow,
  IacBulkPreview,
  IacCapability,
  IacRole,
  IacRoleWithCaps,
  IacScopeType,
  IacBulkExportRow,
  IacMatrixRow,
  IacMatrixDiff,
  IacMatrixApplyResult,
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

  const CHUNK_IN = 200;
  const profileByEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += CHUNK_IN) {
    const slice = emails.slice(i, i + CHUNK_IN);
    const { data, error } = await supabase.from('profiles').select('id, email').in('email', slice);
    if (error) throw error;
    (data ?? []).forEach((p) => profileByEmail.set(String(p.email).toLowerCase(), p.id as string));
  }
  const roleByCode = new Map<string, string>();
  for (let i = 0; i < roleCodes.length; i += CHUNK_IN) {
    const slice = roleCodes.slice(i, i + CHUNK_IN);
    const { data, error } = await supabase.from('iac_roles').select('id, code').in('code', slice);
    if (error) throw error;
    (data ?? []).forEach((r) => roleByCode.set(r.code as string, r.id as string));
  }
  const assignsRes = await supabase
    .from('iac_user_role_assignments')
    .select('user_id, role_id, scope_type, scope_id');
  if (assignsRes.error) throw assignsRes.error;
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

  const CHUNK_IN = 200;
  const profileByEmail = new Map<string, string>();
  for (let i = 0; i < emails.length; i += CHUNK_IN) {
    const slice = emails.slice(i, i + CHUNK_IN);
    const { data, error } = await supabase.from('profiles').select('id, email').in('email', slice);
    if (error) throw error;
    (data ?? []).forEach((p) => profileByEmail.set(String(p.email).toLowerCase(), p.id as string));
  }
  const roleByCode = new Map<string, string>();
  for (let i = 0; i < codes.length; i += CHUNK_IN) {
    const slice = codes.slice(i, i + CHUNK_IN);
    const { data, error } = await supabase.from('iac_roles').select('id, code').in('code', slice);
    if (error) throw error;
    (data ?? []).forEach((r) => roleByCode.set(r.code as string, r.id as string));
  }

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

// -------- Bulk export ---------------------------------------------------
/**
 * Pull every IAC assignment as a flat, round-trip-friendly CSV-shaped
 * payload. Paginated in 1000-row chunks to stay within Supabase limits.
 */
export async function exportAssignments(): Promise<IacBulkExportRow[]> {
  const PAGE = 1000;
  const all: Array<{
    user_id: string; role_id: string; scope_type: IacScopeType;
    scope_id: string | null; expires_at: string | null; assigned_at: string;
  }> = [];
  let from = 0;
  // Loop until a partial page is returned.
  for (;;) {
    const { data, error } = await supabase
      .from('iac_user_role_assignments')
      .select('user_id, role_id, scope_type, scope_id, expires_at, assigned_at')
      .order('assigned_at', { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data ?? []) as typeof all;
    all.push(...batch);
    if (batch.length < PAGE) break;
    from += PAGE;
  }

  if (all.length === 0) return [];

  const userIds = Array.from(new Set(all.map((a) => a.user_id)));
  const roleIds = Array.from(new Set(all.map((a) => a.role_id)));
  // Chunked .in() lookups — large IN lists exceed PostgREST's URL limit
  // and return HTTP 400. 200 UUIDs per batch keeps URLs comfortably small.
  const CHUNK = 200;
  const emailById = new Map<string, string>();
  for (let i = 0; i < userIds.length; i += CHUNK) {
    const slice = userIds.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('profiles').select('id, email').in('id', slice);
    if (error) throw error;
    (data ?? []).forEach((p) => emailById.set(p.id as string, String(p.email)));
  }
  const codeById = new Map<string, string>();
  for (let i = 0; i < roleIds.length; i += CHUNK) {
    const slice = roleIds.slice(i, i + CHUNK);
    const { data, error } = await supabase.from('iac_roles').select('id, code').in('id', slice);
    if (error) throw error;
    (data ?? []).forEach((r) => codeById.set(r.id as string, r.code as string));
  }

  return all.map((a) => ({
    email: emailById.get(a.user_id) ?? '',
    role_code: codeById.get(a.role_id) ?? '',
    scope_type: a.scope_type,
    scope_id: a.scope_id,
    expires_at: a.expires_at,
    assigned_at: a.assigned_at,
  }));
}

// =====================================================================
// Role-matrix export / apply (one row per active user × one col per role)
// =====================================================================

export interface MatrixExportPayload {
  roleCodes: string[];
  rows: IacMatrixRow[];
}

/** Export EVERY active profile with their global role grants. Paginated. */
export async function exportRoleMatrix(): Promise<MatrixExportPayload> {
  // 1. Active roles → column order.
  const { data: rolesData, error: rolesErr } = await supabase
    .from('iac_roles')
    .select('id, code, module')
    .eq('is_active', true)
    .order('module')
    .order('code');
  if (rolesErr) throw rolesErr;
  const roleCodes = (rolesData ?? []).map((r) => r.code as string);
  const roleIdToCode = new Map<string, string>(
    (rolesData ?? []).map((r) => [r.id as string, r.code as string]),
  );

  // 2. ALL active profiles via paginated fetch (bypasses 1k cap).
  const profiles = await fetchAllPaged<{
    id: string; email: string | null; full_name: string | null;
    employee_code: string | null; is_active: boolean;
  }>((from, to) =>
    supabase
      .from('profiles')
      .select('id, email, full_name, employee_code, is_active')
      .eq('is_active', true)
      .order('full_name')
      .range(from, to),
  );

  // 3. ALL global assignments via paginated fetch.
  const assigns = await fetchAllPaged<{
    user_id: string; role_id: string; scope_type: IacScopeType;
  }>((from, to) =>
    supabase
      .from('iac_user_role_assignments')
      .select('user_id, role_id, scope_type')
      .eq('scope_type', 'global')
      .range(from, to),
  );

  const byUser = new Map<string, Set<string>>();
  for (const a of assigns) {
    const code = roleIdToCode.get(a.role_id);
    if (!code) continue;
    let s = byUser.get(a.user_id);
    if (!s) { s = new Set(); byUser.set(a.user_id, s); }
    s.add(code);
  }

  const rows: IacMatrixRow[] = profiles.map((p) => {
    const owned = byUser.get(p.id) ?? new Set<string>();
    const roles: Record<string, 'Y' | ''> = {};
    for (const rc of roleCodes) roles[rc] = owned.has(rc) ? 'Y' : '';
    return {
      employee_code: p.employee_code,
      email: p.email ?? '',
      full_name: p.full_name,
      is_active: p.is_active,
      roles,
    };
  });

  return { roleCodes, rows };
}

/**
 * Lookup helpers used by the diff preview UI. Pulls every active user and
 * every global assignment so the diff can be computed entirely client-side.
 */
export interface MatrixLookupBundle {
  userByEmail: Map<string, { id: string; full_name: string | null; is_active: boolean }>;
  userByCode: Map<string, { id: string; full_name: string | null; is_active: boolean; email: string }>;
  roleByCode: Map<string, string>;
  currentGlobal: Map<string, Map<string, string>>; // user_id -> role_code -> assignment_id
}

export async function loadMatrixLookups(): Promise<MatrixLookupBundle> {
  const { data: rolesData, error: rolesErr } = await supabase
    .from('iac_roles').select('id, code').eq('is_active', true);
  if (rolesErr) throw rolesErr;
  const roleByCode = new Map<string, string>();
  const roleIdToCode = new Map<string, string>();
  (rolesData ?? []).forEach((r) => {
    roleByCode.set(r.code as string, r.id as string);
    roleIdToCode.set(r.id as string, r.code as string);
  });

  const profiles = await fetchAllPaged<{
    id: string; email: string | null; full_name: string | null;
    employee_code: string | null; is_active: boolean;
  }>((from, to) =>
    supabase.from('profiles').select('id, email, full_name, employee_code, is_active').range(from, to),
  );

  const userByEmail = new Map<string, { id: string; full_name: string | null; is_active: boolean }>();
  const userByCode = new Map<string, { id: string; full_name: string | null; is_active: boolean; email: string }>();
  for (const p of profiles) {
    if (p.email) userByEmail.set(String(p.email).toLowerCase(), { id: p.id, full_name: p.full_name, is_active: p.is_active });
    if (p.employee_code) userByCode.set(p.employee_code, { id: p.id, full_name: p.full_name, is_active: p.is_active, email: p.email ?? '' });
  }

  const assigns = await fetchAllPaged<{
    id: string; user_id: string; role_id: string; scope_type: IacScopeType;
  }>((from, to) =>
    supabase
      .from('iac_user_role_assignments')
      .select('id, user_id, role_id, scope_type')
      .eq('scope_type', 'global')
      .range(from, to),
  );
  const currentGlobal = new Map<string, Map<string, string>>();
  for (const a of assigns) {
    const code = roleIdToCode.get(a.role_id);
    if (!code) continue;
    let m = currentGlobal.get(a.user_id);
    if (!m) { m = new Map(); currentGlobal.set(a.user_id, m); }
    m.set(code, a.id);
  }

  return { userByEmail, userByCode, roleByCode, currentGlobal };
}

/**
 * Apply a matrix diff. Inserts and deletes are batched in chunks of 500.
 * Per-batch failures are collected (no silent fail) and an audit row is
 * always written summarising the outcome.
 */
export async function applyMatrixDiff(diff: IacMatrixDiff, fileName?: string): Promise<IacMatrixApplyResult> {
  const BATCH = 500;
  const result: IacMatrixApplyResult = { inserted: 0, deleted: 0, failures: [] };

  // Inserts
  const inserts = diff.toGrant.map((g) => ({
    user_id: g.user_id, role_id: g.role_id,
    scope_type: 'global' as IacScopeType, scope_id: null, expires_at: null,
  }));
  for (let i = 0; i < inserts.length; i += BATCH) {
    const slice = inserts.slice(i, i + BATCH);
    const { error } = await supabase.from('iac_user_role_assignments').insert(slice);
    if (error) {
      result.failures.push({ phase: 'insert', batchIndex: Math.floor(i / BATCH), reason: error.message, size: slice.length });
    } else {
      result.inserted += slice.length;
    }
  }

  // Deletes by assignment_id (precise — never touches non-global rows).
  const deleteIds = diff.toRevoke.map((r) => r.assignment_id);
  for (let i = 0; i < deleteIds.length; i += BATCH) {
    const slice = deleteIds.slice(i, i + BATCH);
    const { error } = await supabase.from('iac_user_role_assignments').delete().in('id', slice);
    if (error) {
      result.failures.push({ phase: 'delete', batchIndex: Math.floor(i / BATCH), reason: error.message, size: slice.length });
    } else {
      result.deleted += slice.length;
    }
  }

  await audit('assignment.bulk_matrix_apply', 'assignment', null, {
    file_name: fileName ?? null,
    granted: result.inserted,
    revoked: result.deleted,
    failures: result.failures,
    grant_total: diff.toGrant.length,
    revoke_total: diff.toRevoke.length,
    unchanged: diff.unchanged,
    error_count: diff.errors.length,
  });

  return result;
}