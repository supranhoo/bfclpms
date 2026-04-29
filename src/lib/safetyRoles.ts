/**
 * Centralised Safety role definitions — SSOT for the Safety module.
 * Mirrors src/lib/roles.ts but lives in its own namespace so PMS RBAC
 * is never polluted with Safety-only concerns. Keep in sync with the
 * `public.safety_app_role` Postgres enum.
 */
export const ALL_SAFETY_ROLES = [
  'admin',
  'safety_head',
  'safety_officer',
  'bu_head',
  'manager',
  'supervisor',
  'worker',
  'auditor',
] as const;

export type SafetyAppRole = typeof ALL_SAFETY_ROLES[number];

export const SAFETY_ROLE_LABEL: Record<SafetyAppRole, string> = {
  admin: 'Safety Admin',
  safety_head: 'Safety Head',
  safety_officer: 'Safety Officer',
  bu_head: 'BU Head',
  manager: 'Manager',
  supervisor: 'Supervisor',
  worker: 'Worker',
  auditor: 'Auditor',
};

export const SAFETY_ROLE_DESCRIPTION: Record<SafetyAppRole, string> = {
  admin: 'Full configuration, RBAC, and module governance.',
  safety_head: 'Owns closure approvals and module-wide oversight.',
  safety_officer: 'Triages incidents and runs investigations.',
  bu_head: 'Approves and tracks incidents within their business unit.',
  manager: 'Departmental visibility and corrective actions.',
  supervisor: 'On-floor first responder and progress logger.',
  worker: 'Reports incidents and receives assigned actions.',
  auditor: 'Read-only audit trail access.',
};
