/**
 * Identity & Access Console — shared types.
 * SSOT for the IAC domain. UI components import only from here, never
 * from the Supabase generated types directly.
 */

export type IacScopeType = 'global' | 'company' | 'business_unit' | 'department';

export interface IacCapability {
  code: string;
  module: string;
  label: string;
  description: string | null;
  is_destructive: boolean;
}

export interface IacRole {
  id: string;
  code: string;
  name: string;
  module: string;
  description: string | null;
  is_system: boolean;
  is_active: boolean;
}

export interface IacRoleWithCaps extends IacRole {
  capabilities: string[]; // capability codes
}

export interface IacAssignment {
  id: string;
  user_id: string;
  role_id: string;
  scope_type: IacScopeType;
  scope_id: string | null;
  assigned_by: string | null;
  assigned_at: string;
  expires_at: string | null;
}

export interface IacAuditEntry {
  id: number;
  actor_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface IacBulkAssignmentRow {
  email: string;
  role_code: string;
  scope_type?: IacScopeType;
  scope_id?: string | null;
  expires_at?: string | null;
}

export interface IacBulkPreview {
  ok: IacBulkAssignmentRow[];
  unknownUsers: IacBulkAssignmentRow[];
  unknownRoles: IacBulkAssignmentRow[];
  duplicates: IacBulkAssignmentRow[];
}

export interface IacBulkExportRow {
  email: string;
  role_code: string;
  scope_type: IacScopeType;
  scope_id: string | null;
  expires_at: string | null;
  assigned_at: string;
}

// -------- Role matrix (per-user × per-role) ----------------------------
/** One row per active user. Identity columns are read-only context. */
export interface IacMatrixRow {
  employee_code: string | null;
  email: string;
  full_name: string | null;
  is_active: boolean;
  /** Map of role_code -> 'Y' | '' (only role columns mutate the system). */
  roles: Record<string, 'Y' | ''>;
}

export interface IacMatrixDiffEntry {
  user_id: string;
  email: string;
  full_name: string | null;
  role_id: string;
  role_code: string;
}

export interface IacMatrixRowError {
  lineNo: number;
  email: string;
  reason: string;
}

export interface IacMatrixDiff {
  toGrant: IacMatrixDiffEntry[];
  toRevoke: Array<IacMatrixDiffEntry & { assignment_id: string }>;
  unchanged: number;
  errors: IacMatrixRowError[];
  /** Unknown role-code headers found in the uploaded CSV. */
  unknownRoleColumns: string[];
}

export interface IacMatrixApplyResult {
  inserted: number;
  deleted: number;
  failures: Array<{ phase: 'insert' | 'delete'; batchIndex: number; reason: string; size: number }>;
}

export type BulkRowIssue =
  | 'unknown_user'
  | 'unknown_role'
  | 'duplicate'
  | 'missing_email'
  | 'missing_role'
  | 'bad_scope'
  | 'bad_date';

export interface ParsedBulkRow {
  raw: Record<string, string>;
  row: IacBulkAssignmentRow | null;
  issues: BulkRowIssue[];
  lineNo: number;
}