import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { PIPStatus, PIPOutcome, PIPMilestoneStatus } from '@/lib/pip/pipVocabulary';

// ADR-205: status/outcome vocabulary is owned by `@/lib/pip/pipVocabulary`.
export type { PIPStatus, PIPOutcome } from '@/lib/pip/pipVocabulary';
export type MilestoneStatus = PIPMilestoneStatus;

/**
 * ADR-205 / POLICY §PIP-NOTIFY-SSOT — every PIP notification goes through the
 * `pip_notify` definer RPC. Direct `notifications` inserts are blocked by
 * `can_send_notification_to()` whenever the sender (typically HR) is outside
 * the employee's reporting chain.
 */
async function notifyPip(
  pipId: string,
  event: 'pip_initiated' | 'pip_completed' | 'pip_milestone_reminder',
  recipient?: string,
  metadata?: Record<string, unknown>,
): Promise<void> {
  const { error } = await supabase.rpc('pip_notify', {
    p_pip_id: pipId,
    p_event: event,
    p_recipient: recipient ?? null,
    p_metadata: (metadata ?? {}) as never,
  } as never);
  // A failed notification must never roll back a completed workflow action.
  if (error) console.error('[PIP] notification dispatch failed', event, error);
}

/** Audit rows are mandatory but must not mask the primary action's success. */
async function writePipAudit(
  pipId: string,
  action: string,
  oldValue: Record<string, unknown> | null,
  newValue: Record<string, unknown> | null,
): Promise<void> {
  const { error } = await supabase.from('pip_audit_logs').insert({
    pip_id: pipId,
    action,
    old_value: oldValue,
    new_value: newValue,
  } as never);
  if (error) console.error('[PIP] audit write failed', action, error);
}

export const PIP_PAGE_SIZE = 25;

export interface PIPMilestone {
  id: string;
  pip_id: string;
  milestone_date: string;
  description: string;
  expected_outcome: string;
  actual_outcome: string | null;
  status: MilestoneStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  remarks: string | null;
  created_at: string;
  updated_at: string;
}

export interface PIP {
  id: string;
  employee_id: string;
  initiated_by: string;
  hr_reviewer_id: string | null;
  status: PIPStatus;
  start_date: string;
  end_date: string;
  extended_end_date: string | null;
  reason: string;
  improvement_areas: string[];
  success_criteria: string;
  hr_remarks: string | null;
  hr_approved_at: string | null;
  completion_remarks: string | null;
  outcome: PIPOutcome | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  employee?: {
    id: string;
    full_name: string | null;
    employee_code: string | null;
    department_id: string | null;
    designation: string | null;
    email: string | null;
  };
  initiator?: {
    id: string;
    full_name: string | null;
  };
  hr_reviewer?: {
    id: string;
    full_name: string | null;
  };
  milestones?: PIPMilestone[];
}

export interface PIPAuditLog {
  id: string;
  pip_id: string;
  action: string;
  performed_by: string | null;
  old_value: any;
  new_value: any;
  metadata: any;
  created_at: string;
  performer?: {
    full_name: string | null;
  };
}

export interface CreatePIPData {
  employee_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  improvement_areas: string[];
  success_criteria: string;
  milestones?: Omit<PIPMilestone, 'id' | 'pip_id' | 'created_at' | 'updated_at' | 'actual_outcome' | 'status' | 'reviewed_by' | 'reviewed_at' | 'remarks'>[];
}

export interface PIPListFilters {
  status?: PIPStatus;
  employeeId?: string;
  initiatedBy?: string;
  /** 1-based page index. Omit for the first page. */
  page?: number;
  pageSize?: number;
  /** Server-side search across employee name / code. */
  search?: string;
}

export interface PIPListResult {
  rows: PIP[];
  total: number;
  page: number;
  pageSize: number;
}

// Fetch PIPs with filters + server-side pagination (ADR-205)
export function usePIPs(filters?: PIPListFilters) {
  const page = Math.max(1, filters?.page ?? 1);
  const pageSize = filters?.pageSize ?? PIP_PAGE_SIZE;

  return useQuery({
    queryKey: ['pips', filters, page, pageSize],
    queryFn: async (): Promise<PIPListResult> => {
      let query = supabase
        .from('performance_improvement_plans')
        .select(`
          *,
          employee:profiles!performance_improvement_plans_employee_id_fkey(
            id, full_name, employee_code, department_id, designation, email
          ),
          initiator:profiles!performance_improvement_plans_initiated_by_fkey(
            id, full_name
          ),
          hr_reviewer:profiles!performance_improvement_plans_hr_reviewer_id_fkey(
            id, full_name
          ),
          milestones:pip_milestones(*)
        `, { count: 'exact' })
        .order('created_at', { ascending: false });

      if (filters?.status) {
        query = query.eq('status', filters.status);
      }
      if (filters?.employeeId) {
        query = query.eq('employee_id', filters.employeeId);
      }
      if (filters?.initiatedBy) {
        query = query.eq('initiated_by', filters.initiatedBy);
      }

      const from = (page - 1) * pageSize;
      query = query.range(from, from + pageSize - 1);

      const { data, error, count } = await query;
      if (error) throw error;
      return {
        rows: (data ?? []) as PIP[],
        total: count ?? 0,
        page,
        pageSize,
      };
    },
  });
}

// Fetch single PIP with details
export function usePIPDetails(pipId: string | undefined) {
  return useQuery({
    queryKey: ['pip', pipId],
    queryFn: async () => {
      if (!pipId) return null;

      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .select(`
          *,
          employee:profiles!performance_improvement_plans_employee_id_fkey(
            id, full_name, employee_code, department_id, designation, email
          ),
          initiator:profiles!performance_improvement_plans_initiated_by_fkey(
            id, full_name
          ),
          hr_reviewer:profiles!performance_improvement_plans_hr_reviewer_id_fkey(
            id, full_name
          ),
          milestones:pip_milestones(*)
        `)
        .eq('id', pipId)
        .single();

      if (error) throw error;
      return data as PIP;
    },
    enabled: !!pipId,
  });
}

// Fetch PIP audit logs
export function usePIPAuditLogs(pipId: string | undefined) {
  return useQuery({
    queryKey: ['pip-audit-logs', pipId],
    queryFn: async () => {
      if (!pipId) return [];

      const { data, error } = await supabase
        .from('pip_audit_logs')
        .select(`
          *,
          performer:profiles!pip_audit_logs_performed_by_fkey(full_name)
        `)
        .eq('pip_id', pipId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as PIPAuditLog[];
    },
    enabled: !!pipId,
  });
}

// Create PIP
export function useCreatePIP() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (data: CreatePIPData) => {
      const { milestones, ...pipData } = data;

      // Get current user ID
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      // Create PIP
      const { data: pip, error: pipError } = await supabase
        .from('performance_improvement_plans')
        .insert({
          ...pipData,
          initiated_by: user.id,
          status: 'draft',
        } as any)
        .select()
        .single();

      if (pipError) throw pipError;

      // Create milestones if provided
      if (milestones && milestones.length > 0) {
        const milestonesWithPipId = milestones.map(m => ({
          ...m,
          pip_id: pip.id,
          status: 'pending',
        }));

        const { error: msError } = await supabase
          .from('pip_milestones')
          .insert(milestonesWithPipId as any);

        if (msError) throw msError;
      }

      await writePipAudit(pip.id, 'CREATED', null, pipData as Record<string, unknown>);
      await notifyPip(pip.id, 'pip_initiated');

      return pip;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pips'] });
      toast({ title: 'PIP created successfully' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to create PIP', description: error.message, variant: 'destructive' });
    },
  });
}

// Submit PIP for HR approval
export function useSubmitPIPForApproval() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async (pipId: string) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .update({ status: 'pending_hr_approval' } as any)
        .eq('id', pipId)
        .select()
        .single();

      if (error) throw error;

      await writePipAudit(pipId, 'SUBMITTED_FOR_APPROVAL', { status: 'draft' }, { status: 'pending_hr_approval' });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pips'] });
      queryClient.invalidateQueries({ queryKey: ['pip'] });
      toast({ title: 'PIP submitted for HR approval' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to submit PIP', description: error.message, variant: 'destructive' });
    },
  });
}

// HR Approve PIP
export function useApprovePIP() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pipId, remarks }: { pipId: string; remarks?: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .update({
          status: 'active',
          hr_reviewer_id: user.id,
          hr_remarks: remarks,
          hr_approved_at: new Date().toISOString(),
        } as any)
        .eq('id', pipId)
        .select()
        .single();

      if (error) throw error;

      await writePipAudit(pipId, 'HR_APPROVED', { status: 'pending_hr_approval' }, { status: 'active', hr_remarks: remarks });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pips'] });
      queryClient.invalidateQueries({ queryKey: ['pip'] });
      toast({ title: 'PIP approved and activated' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to approve PIP', description: error.message, variant: 'destructive' });
    },
  });
}

// Reject PIP (send back to draft)
export function useRejectPIP() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pipId, remarks }: { pipId: string; remarks: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .update({
          status: 'draft',
          hr_reviewer_id: user.id,
          hr_remarks: remarks,
        } as any)
        .eq('id', pipId)
        .select()
        .single();

      if (error) throw error;

      await writePipAudit(pipId, 'HR_REJECTED', { status: 'pending_hr_approval' }, { status: 'draft', hr_remarks: remarks });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pips'] });
      queryClient.invalidateQueries({ queryKey: ['pip'] });
      toast({ title: 'PIP sent back for revision' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to reject PIP', description: error.message, variant: 'destructive' });
    },
  });
}

// Complete PIP
export function useCompletePIP() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pipId, outcome, remarks }: { 
      pipId: string; 
      outcome: PIPOutcome; 
      remarks: string 
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .update({
          status: 'completed',
          outcome,
          completion_remarks: remarks,
        } as any)
        .eq('id', pipId)
        .select()
        .single();

      if (error) throw error;

      await writePipAudit(pipId, 'COMPLETED', null, { status: 'completed', outcome, completion_remarks: remarks });
      await notifyPip(pipId, 'pip_completed');

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pips'] });
      queryClient.invalidateQueries({ queryKey: ['pip'] });
      toast({ title: 'PIP completed' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to complete PIP', description: error.message, variant: 'destructive' });
    },
  });
}

// Extend PIP
export function useExtendPIP() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ pipId, newEndDate, remarks }: { 
      pipId: string; 
      newEndDate: string; 
      remarks: string 
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .update({
          status: 'extended',
          extended_end_date: newEndDate,
          hr_remarks: remarks,
        } as any)
        .eq('id', pipId)
        .select()
        .single();

      if (error) throw error;

      await writePipAudit(pipId, 'EXTENDED', null, { status: 'extended', extended_end_date: newEndDate, remarks });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pips'] });
      queryClient.invalidateQueries({ queryKey: ['pip'] });
      toast({ title: 'PIP extended' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to extend PIP', description: error.message, variant: 'destructive' });
    },
  });
}

// Update milestone
export function useUpdateMilestone() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  return useMutation({
    mutationFn: async ({ 
      milestoneId, 
      pipId,
      status, 
      actualOutcome, 
      remarks 
    }: { 
      milestoneId: string;
      pipId: string;
      status: MilestoneStatus; 
      actualOutcome: string; 
      remarks?: string 
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase
        .from('pip_milestones')
        .update({
          status,
          actual_outcome: actualOutcome,
          remarks,
          reviewed_by: user.id,
          reviewed_at: new Date().toISOString(),
        } as any)
        .eq('id', milestoneId)
        .select()
        .single();

      if (error) throw error;

      await writePipAudit(pipId, 'MILESTONE_UPDATED', null, { milestone_id: milestoneId, status, actual_outcome: actualOutcome });

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pips'] });
      queryClient.invalidateQueries({ queryKey: ['pip'] });
      toast({ title: 'Milestone updated' });
    },
    onError: (error: any) => {
      toast({ title: 'Failed to update milestone', description: error.message, variant: 'destructive' });
    },
  });
}

// Get PIP summary stats
export function usePIPSummary() {
  return useQuery({
    queryKey: ['pip-summary'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('performance_improvement_plans')
        .select('id, status, outcome');

      if (error) throw error;

      return {
        total: data.length,
        draft: data.filter(p => p.status === 'draft').length,
        pendingApproval: data.filter(p => p.status === 'pending_hr_approval').length,
        active: data.filter(p => p.status === 'active').length,
        extended: data.filter(p => p.status === 'extended').length,
        completed: data.filter(p => p.status === 'completed').length,
        terminated: data.filter(p => p.status === 'terminated').length,
        improved: data.filter(p => p.outcome === 'improved').length,
        notImproved: data.filter(p => p.outcome === 'not_improved').length,
      };
    },
  });
}
