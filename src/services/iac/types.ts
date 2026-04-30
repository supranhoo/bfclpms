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