import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export type OverrideType = 'grant_all' | 'grant_bu' | 'grant_team' | 'deny';

export interface DirectoryOverride {
  user_id: string;
  override_type: OverrideType;
  business_unit_ids: string[];
  can_assist: boolean;
  reason: string;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface AccessAuditEntry {
  id: number;
  actor_id: string | null;
  target_user_id: string | null;
  action: 'kill_switch_toggled' | 'override_upserted' | 'override_deleted';
  before: unknown;
  after: unknown;
  reason: string | null;
  created_at: string;
}

export interface KillSwitches {
  annual_review_directory_search_enabled: boolean;
  assisted_self_submission_enabled: boolean;
}

const AR_ACCESS_KEY = ['ar', 'access-control'] as const;

export type RoleSource =
  | 'admin' | 'hr_pms' | 'hr_team' | 'bu_head' | 'hod' | 'reporting_manager' | 'skip_manager';
export type AssistScopeSetting = 'same_as_search' | 'direct_reports_only' | 'none';

export interface RoleCapability {
  role_source: RoleSource;
  can_search: boolean;
  can_assist: boolean;
  assist_scope: AssistScopeSetting;
  updated_at: string;
  updated_by: string | null;
}

export function useRoleCapabilities() {
  return useQuery<RoleCapability[]>({
    queryKey: [...AR_ACCESS_KEY, 'role-capabilities'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_annual_review_role_capabilities' as never);
      if (error) throw error;
      return (data ?? []) as RoleCapability[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertRoleCapability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      role_source: RoleSource;
      can_search: boolean;
      can_assist: boolean;
      assist_scope: AssistScopeSetting;
      reason: string;
    }) => {
      const { error } = await supabase.rpc('upsert_annual_review_role_capability' as never, {
        p_role_source: args.role_source,
        p_can_search: args.can_search,
        p_can_assist: args.can_assist,
        p_assist_scope: args.assist_scope,
        p_reason: args.reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_ACCESS_KEY });
      qc.invalidateQueries({ queryKey: ['annual-review', 'directory-access'] });
      qc.invalidateQueries({ queryKey: ['annual-review', 'directory-search'] });
    },
  });
}

export function useKillSwitches() {
  return useQuery<KillSwitches>({
    queryKey: [...AR_ACCESS_KEY, 'kill-switches'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('app_settings')
        .select('annual_review_directory_search_enabled, assisted_self_submission_enabled')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return {
        annual_review_directory_search_enabled: Boolean(data?.annual_review_directory_search_enabled),
        assisted_self_submission_enabled: Boolean(data?.assisted_self_submission_enabled),
      };
    },
    staleTime: 30_000,
  });
}

export function useSetKillSwitch() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { key: keyof KillSwitches; value: boolean; reason: string }) => {
      const { error } = await supabase.rpc('set_annual_review_access_setting' as never, {
        p_key: args.key, p_value: args.value, p_reason: args.reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_ACCESS_KEY });
      qc.invalidateQueries({ queryKey: ['annual-review', 'directory-access'] });
    },
  });
}

export function useDirectoryOverrides() {
  return useQuery<DirectoryOverride[]>({
    queryKey: [...AR_ACCESS_KEY, 'overrides'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('annual_review_directory_overrides')
        .select('*')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as DirectoryOverride[];
    },
    staleTime: 30_000,
  });
}

export function useUpsertOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      user_id: string;
      override_type: OverrideType;
      business_unit_ids?: string[];
      can_assist: boolean;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc('upsert_annual_review_directory_override' as never, {
        p_user_id: args.user_id,
        p_override_type: args.override_type,
        p_business_unit_ids: args.business_unit_ids ?? [],
        p_can_assist: args.can_assist,
        p_reason: args.reason,
      } as never);
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_ACCESS_KEY });
      qc.invalidateQueries({ queryKey: ['annual-review', 'directory-access'] });
      qc.invalidateQueries({ queryKey: ['annual-review', 'directory-search'] });
    },
  });
}

export function useDeleteOverride() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { user_id: string; reason: string }) => {
      const { error } = await supabase.rpc('delete_annual_review_directory_override' as never, {
        p_user_id: args.user_id, p_reason: args.reason,
      } as never);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_ACCESS_KEY });
      qc.invalidateQueries({ queryKey: ['annual-review', 'directory-access'] });
      qc.invalidateQueries({ queryKey: ['annual-review', 'directory-search'] });
    },
  });
}

export function useAccessAudit(limit = 100) {
  return useQuery<AccessAuditEntry[]>({
    queryKey: [...AR_ACCESS_KEY, 'audit', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('annual_review_access_audit')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as AccessAuditEntry[];
    },
    staleTime: 15_000,
  });
}

export function useAccessExplain(userId: string | null) {
  return useQuery({
    queryKey: [...AR_ACCESS_KEY, 'explain', userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_annual_review_access_explain' as never, {
        v_uid: userId,
      } as never);
      if (error) throw error;
      return data as {
        access: { can_access: boolean; scope?: string; can_assist?: boolean; source?: string };
        override: DirectoryOverride | null;
        auto: {
          is_admin: boolean; is_hr_pms: boolean; in_hr_bu: boolean;
          bu_head_of: Array<{ id: string; name: string }>;
          hod_of: Array<{ id: string; name: string }>;
          direct_reports: number; skip_reports: number;
        };
      };
    },
    staleTime: 15_000,
  });
}

// ---------- ADR-148: Management stage backfill ----------

export interface ManagementSeedingGap {
  instance_id: string;
  employee_id: string;
  employee_code: string | null;
  employee_name: string | null;
  overall_status: string;
  enabled_stages: string[] | null;
  has_management_stage: boolean;
  has_management_id: boolean;
  bu_head_id: string | null;
  needs_reopen: boolean;
  cycle_id: string | null;
  cycle_name: string | null;
}

export function useManagementSeedingGaps(managementUid: string | null) {
  return useQuery<ManagementSeedingGap[]>({
    queryKey: [...AR_ACCESS_KEY, 'mgmt-gaps', managementUid],
    enabled: !!managementUid,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_management_seeding_gaps' as never, {
        p_management_uid: managementUid,
      } as never);
      if (error) throw error;
      return (data ?? []) as ManagementSeedingGap[];
    },
    staleTime: 15_000,
  });
}

export function useBackfillManagementStage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: {
      management_uid: string;
      reopen_completed: boolean;
      dry_run: boolean;
      reason: string;
    }) => {
      const { data, error } = await supabase.rpc('backfill_management_stage_for_manager' as never, {
        p_management_uid: args.management_uid,
        p_reopen_completed: args.reopen_completed,
        p_dry_run: args.dry_run,
        p_reason: args.reason,
      } as never);
      if (error) throw error;
      return data as {
        management_uid: string;
        dry_run: boolean;
        reopen_completed: boolean;
        rows_stamped: number;
        rows_reopened: number;
        snapshots_written: number;
      };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_ACCESS_KEY });
      qc.invalidateQueries({ queryKey: ['annual-review'] });
    },
  });
}

export interface ManagementBulkBackfillRow {
  management_uid: string;
  management_name: string | null;
  rows_stamped: number;
  rows_reopened: number;
  snapshots_written: number;
}

export function useBackfillAllManagement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (args: { reopen_completed: boolean; dry_run: boolean; reason: string }) => {
      const { data, error } = await supabase.rpc('backfill_management_stage_all' as never, {
        p_reopen_completed: args.reopen_completed,
        p_dry_run: args.dry_run,
        p_reason: args.reason,
      } as never);
      if (error) throw error;
      return (data ?? []) as ManagementBulkBackfillRow[];
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: AR_ACCESS_KEY });
      qc.invalidateQueries({ queryKey: ['annual-review'] });
    },
  });
}