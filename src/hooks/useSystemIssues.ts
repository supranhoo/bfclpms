import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAllKpis, useKpiQueries } from './useKpis';
import { useProfiles } from './useOrganization';
import { useTrainingNeeds } from './useTNI';
import { usePIPs } from './usePIP';
import { useSlaThresholds } from './useWorkflowSettings';
import { format } from 'date-fns';
import { isKpiLockedForPeriod } from '@/lib/frequencyUtils';

export type IssueType = 'query' | 'training_need' | 'pip' | 'pip_milestone' | 'stalled_kpi' | 'pending_kra';
export type IssuePriority = 'critical' | 'high' | 'medium' | 'low';
export type IssueStatus = 'open' | 'in_progress' | 'overdue' | 'resolved';

export interface SystemIssue {
  id: string;
  issueType: IssueType;
  sourceId: string;
  subject: string;
  description: string;
  employeeId: string | null;
  employeeName: string;
  departmentId: string | null;
  departmentName: string;
  assignedTo: string | null;
  assignedToName: string;
  status: IssueStatus;
  priority: IssuePriority;
  createdAt: Date;
  ageInDays: number;
  relatedEntityId?: string;
  metadata?: Record<string, unknown>;
}

export interface IssueSummary {
  totalOpen: number;
  criticalOverdue: number;
  resolvedThisWeek: number;
  avgResolutionDays: number;
  byType: Record<IssueType, number>;
  byDepartment: Record<string, { name: string; count: number; critical: number }>;
}

// Default thresholds - will be overridden by configurable settings
const DEFAULT_AGE_THRESHOLDS: Record<IssueType, { warning: number; critical: number }> = {
  query: { warning: 5, critical: 10 },
  training_need: { warning: 14, critical: 30 },
  pip: { warning: 7, critical: 14 },
  pip_milestone: { warning: 0, critical: 7 },
  stalled_kpi: { warning: 14, critical: 30 },
  pending_kra: { warning: 7, critical: 14 },
};

function calculateAge(date: Date | string): number {
  const created = new Date(date);
  const now = new Date();
  return Math.floor((now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24));
}

function getPriority(
  issueType: IssueType, 
  ageInDays: number, 
  thresholds: Record<IssueType, { warning: number; critical: number }>,
  basePriority?: string
): IssuePriority {
  const threshold = thresholds[issueType];
  
  if (ageInDays >= threshold.critical) return 'critical';
  if (ageInDays >= threshold.warning) return 'high';
  
  if (basePriority === 'high' || basePriority === 'critical') return basePriority as IssuePriority;
  if (basePriority === 'medium') return 'medium';
  
  return 'low';
}

function getStatus(
  issueType: IssueType, 
  ageInDays: number, 
  thresholds: Record<IssueType, { warning: number; critical: number }>,
  baseStatus?: string
): IssueStatus {
  const threshold = thresholds[issueType];
  
  if (baseStatus === 'resolved' || baseStatus === 'completed') return 'resolved';
  if (ageInDays >= threshold.critical) return 'overdue';
  if (baseStatus === 'in_progress' || baseStatus === 'training_planned' || baseStatus === 'active') return 'in_progress';
  
  return 'open';
}

export function shouldCreatePendingKraIssue(
  kpi: {
    status?: string | null;
    is_org_level?: boolean | null;
    frequency?: string | null;
    review_period?: string | null;
    review_year?: number | null;
    frequency_cycle_start?: string | null;
  },
  ageInDays: number,
  warningThreshold: number,
): boolean {
  if (kpi.status !== 'kra_set') return false;
  if (kpi.is_org_level) return false;

  if (
    kpi.frequency &&
    kpi.review_period &&
    kpi.review_year &&
    isKpiLockedForPeriod(kpi.frequency, kpi.review_period, kpi.review_year, kpi.frequency_cycle_start)
  ) {
    return false;
  }

  return ageInDays >= warningThreshold;
}

export function useSystemIssues() {
  const { data: kpis = [], isLoading: kpisLoading } = useAllKpis();
  const { data: profiles = [], isLoading: profilesLoading } = useProfiles();
  const { data: trainingNeeds = [], isLoading: tniLoading } = useTrainingNeeds();
  const { data: pips = [], isLoading: pipsLoading } = usePIPs();
  const { thresholds: configuredThresholds, isLoading: thresholdsLoading } = useSlaThresholds();

  // Merge configured thresholds with defaults
  const AGE_THRESHOLDS: Record<IssueType, { warning: number; critical: number }> = {
    ...DEFAULT_AGE_THRESHOLDS,
    ...configuredThresholds,
  };

  const kpiIds = kpis.map(k => k.id);
  const { data: queries = [], isLoading: queriesLoading } = useKpiQueries(kpiIds);

  // Fetch PIP milestones for overdue tracking
  const { data: milestones = [], isLoading: milestonesLoading } = useQuery({
    queryKey: ['pip-milestones-all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('pip_milestones')
        .select('*, performance_improvement_plans!inner(employee_id, initiated_by)')
        .eq('status', 'pending')
        .lt('milestone_date', new Date().toISOString().split('T')[0]);
      
      if (error) throw error;
      return data || [];
    },
  });

  const isLoading = kpisLoading || profilesLoading || tniLoading || pipsLoading || queriesLoading || milestonesLoading || thresholdsLoading;

  // Create lookup maps
  const profileMap = new Map(profiles.map(p => [p.id, p]));
  const kpiMap = new Map(kpis.map(k => [k.id, k]));

  // Aggregate all issues
  const issues: SystemIssue[] = [];

  // 1. Open Queries
  queries
    .filter(q => q.status === 'open')
    .forEach(query => {
      const kpi = kpiMap.get(query.kpi_id);
      const employee = kpi ? profileMap.get(kpi.employee_id) : null;
      const assignedTo = profileMap.get(query.raised_to);
      const ageInDays = calculateAge(query.created_at);

      issues.push({
        id: `query-${query.id}`,
        issueType: 'query',
        sourceId: query.id,
        subject: kpi?.kpi_name || 'Unknown KPI',
        description: query.reason,
        employeeId: kpi?.employee_id || null,
        employeeName: employee?.full_name || 'Unknown',
        departmentId: employee?.department_id || null,
        departmentName: (employee?.departments as { name?: string })?.name || 'Unknown',
        assignedTo: query.raised_to,
        assignedToName: assignedTo?.full_name || 'Unknown',
        status: getStatus('query', ageInDays, AGE_THRESHOLDS),
        priority: getPriority('query', ageInDays, AGE_THRESHOLDS),
        createdAt: new Date(query.created_at),
        ageInDays,
        relatedEntityId: query.kpi_id,
      });
    });

  // 2. Training Needs (not completed)
  trainingNeeds
    .filter(tn => tn.status !== 'completed')
    .forEach(tn => {
      const employee = tn.employee || profileMap.get(tn.employee_id);
      const assignedTo = tn.identified_by ? profileMap.get(tn.identified_by) : null;
      const ageInDays = calculateAge(tn.created_at);

      const employeeName = tn.employee?.full_name || 
        (employee && 'full_name' in employee ? employee.full_name : null) || 
        'Unknown';
      const departmentId = tn.employee?.department_id || null;
      const departmentName = tn.category?.name || 'Unknown';

      issues.push({
        id: `tni-${tn.id}`,
        issueType: 'training_need',
        sourceId: tn.id,
        subject: tn.training_recommendation || 'Training Required',
        description: `Gap: ${tn.gap_type} | Priority: ${tn.priority}`,
        employeeId: tn.employee_id,
        employeeName: employeeName || 'Unknown',
        departmentId: departmentId,
        departmentName: departmentName,
        assignedTo: tn.identified_by,
        assignedToName: assignedTo?.full_name || 'HR',
        status: getStatus('training_need', ageInDays, AGE_THRESHOLDS, tn.status),
        priority: getPriority('training_need', ageInDays, AGE_THRESHOLDS, tn.priority),
        createdAt: new Date(tn.created_at),
        ageInDays,
        relatedEntityId: tn.kpi_id || undefined,
      });
    });

  // 3. Active PIPs
  pips
    .filter(pip => pip.status === 'active' || pip.status === 'pending_hr_approval')
    .forEach(pip => {
      const employee = profileMap.get(pip.employee_id);
      const initiator = profileMap.get(pip.initiated_by);
      const ageInDays = calculateAge(pip.created_at);

      issues.push({
        id: `pip-${pip.id}`,
        issueType: 'pip',
        sourceId: pip.id,
        subject: `PIP: ${employee?.full_name || 'Unknown'}`,
        description: pip.reason,
        employeeId: pip.employee_id,
        employeeName: employee?.full_name || 'Unknown',
        departmentId: employee?.department_id || null,
        departmentName: (employee?.departments as { name?: string })?.name || 'Unknown',
        assignedTo: pip.initiated_by,
        assignedToName: initiator?.full_name || 'Unknown',
        status: pip.status === 'pending_hr_approval' ? 'open' : 'in_progress',
        priority: 'critical',
        createdAt: new Date(pip.created_at),
        ageInDays,
        metadata: { pipStatus: pip.status },
      });
    });

  // 4. Overdue PIP Milestones
  milestones.forEach((ms: { id: string; milestone_date: string; notes?: string; performance_improvement_plans: { employee_id: string; initiated_by: string } }) => {
    const pip = ms.performance_improvement_plans;
    const employee = profileMap.get(pip.employee_id);
    const initiator = profileMap.get(pip.initiated_by);
    const ageInDays = calculateAge(ms.milestone_date);

    issues.push({
      id: `milestone-${ms.id}`,
      issueType: 'pip_milestone',
      sourceId: ms.id,
      subject: `Overdue Milestone: ${format(new Date(ms.milestone_date), 'dd MMM yyyy')}`,
      description: ms.notes || 'Scheduled check-in not completed',
      employeeId: pip.employee_id,
      employeeName: employee?.full_name || 'Unknown',
      departmentId: employee?.department_id || null,
      departmentName: (employee?.departments as { name?: string })?.name || 'Unknown',
      assignedTo: pip.initiated_by,
      assignedToName: initiator?.full_name || 'Unknown',
      status: 'overdue',
      priority: 'critical',
      createdAt: new Date(ms.milestone_date),
      ageInDays,
    });
  });

  // 5. Stalled KPIs (same status > 30 days, not completed)
  const stalledStatuses = ['self_review', 'manager_review', 'management_review', 'audit_review'];
  kpis
    .filter(kpi => {
      if (!stalledStatuses.includes(kpi.status)) return false;
      const ageInDays = calculateAge(kpi.updated_at || kpi.created_at);
      return ageInDays >= AGE_THRESHOLDS.stalled_kpi.warning;
    })
    .forEach(kpi => {
      const employee = profileMap.get(kpi.employee_id);
      const ageInDays = calculateAge(kpi.updated_at || kpi.created_at);
      
      // Determine who is responsible based on status
      let assignedToId: string | null = null;
      if (kpi.status === 'self_review') assignedToId = kpi.employee_id;
      else if (kpi.status === 'manager_review') assignedToId = employee?.reporting_manager_id || null;
      
      const assignedTo = assignedToId ? profileMap.get(assignedToId) : null;

      issues.push({
        id: `stalled-${kpi.id}`,
        issueType: 'stalled_kpi',
        sourceId: kpi.id,
        subject: kpi.kpi_name,
        description: `Stuck at ${kpi.status.replace('_', ' ')} for ${ageInDays} days`,
        employeeId: kpi.employee_id,
        employeeName: employee?.full_name || 'Unknown',
        departmentId: employee?.department_id || null,
        departmentName: (employee?.departments as { name?: string })?.name || 'Unknown',
        assignedTo: assignedToId,
        assignedToName: assignedTo?.full_name || 'Workflow Owner',
        status: getStatus('stalled_kpi', ageInDays, AGE_THRESHOLDS),
        priority: getPriority('stalled_kpi', ageInDays, AGE_THRESHOLDS),
        createdAt: new Date(kpi.updated_at || kpi.created_at),
        ageInDays,
        metadata: { kpiStatus: kpi.status },
      });
    });

  // 6. Pending KRA Acceptance (kra_set status > 7 days)
  kpis
    .filter(kpi => {
      const ageInDays = calculateAge(kpi.created_at);
      return shouldCreatePendingKraIssue(kpi, ageInDays, AGE_THRESHOLDS.pending_kra.warning);
    })
    .forEach(kpi => {
      const employee = profileMap.get(kpi.employee_id);
      const ageInDays = calculateAge(kpi.created_at);

      issues.push({
        id: `kra-${kpi.id}`,
        issueType: 'pending_kra',
        sourceId: kpi.id,
        subject: kpi.kpi_name,
        description: `KRA pending acceptance for ${ageInDays} days`,
        employeeId: kpi.employee_id,
        employeeName: employee?.full_name || 'Unknown',
        departmentId: employee?.department_id || null,
        departmentName: (employee?.departments as { name?: string })?.name || 'Unknown',
        assignedTo: kpi.employee_id,
        assignedToName: employee?.full_name || 'Unknown',
        status: getStatus('pending_kra', ageInDays, AGE_THRESHOLDS),
        priority: getPriority('pending_kra', ageInDays, AGE_THRESHOLDS),
        createdAt: new Date(kpi.created_at),
        ageInDays,
      });
    });

  // Calculate summary
  const summary: IssueSummary = {
    totalOpen: issues.filter(i => i.status !== 'resolved').length,
    criticalOverdue: issues.filter(i => i.priority === 'critical' || i.status === 'overdue').length,
    resolvedThisWeek: 0, // Would need historical data
    avgResolutionDays: 0, // Would need historical data
    byType: {
      query: issues.filter(i => i.issueType === 'query').length,
      training_need: issues.filter(i => i.issueType === 'training_need').length,
      pip: issues.filter(i => i.issueType === 'pip').length,
      pip_milestone: issues.filter(i => i.issueType === 'pip_milestone').length,
      stalled_kpi: issues.filter(i => i.issueType === 'stalled_kpi').length,
      pending_kra: issues.filter(i => i.issueType === 'pending_kra').length,
    },
    byDepartment: {},
  };

  // Aggregate by department
  issues.forEach(issue => {
    const deptId = issue.departmentId || 'unknown';
    if (!summary.byDepartment[deptId]) {
      summary.byDepartment[deptId] = {
        name: issue.departmentName,
        count: 0,
        critical: 0,
      };
    }
    summary.byDepartment[deptId].count++;
    if (issue.priority === 'critical' || issue.status === 'overdue') {
      summary.byDepartment[deptId].critical++;
    }
  });

  return {
    issues,
    summary,
    isLoading,
  };
}

export const ISSUE_TYPE_LABELS: Record<IssueType, string> = {
  query: 'Open Query',
  training_need: 'Training Need',
  pip: 'Active PIP',
  pip_milestone: 'Overdue Milestone',
  stalled_kpi: 'Stalled KPI',
  pending_kra: 'Pending KRA',
};

export const ISSUE_TYPE_COLORS: Record<IssueType, string> = {
  query: 'bg-warning/10 text-warning border-warning/20',
  training_need: 'bg-rose-500/10 text-rose-500 border-rose-500/20',
  pip: 'bg-destructive/10 text-destructive border-destructive/20',
  pip_milestone: 'bg-destructive/10 text-destructive border-destructive/20',
  stalled_kpi: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
  pending_kra: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
};

export const PRIORITY_COLORS: Record<IssuePriority, string> = {
  critical: 'bg-destructive text-destructive-foreground',
  high: 'bg-orange-500 text-white',
  medium: 'bg-warning text-warning-foreground',
  low: 'bg-muted text-muted-foreground',
};

export const STATUS_COLORS: Record<IssueStatus, string> = {
  open: 'bg-blue-500/10 text-blue-500',
  in_progress: 'bg-warning/10 text-warning',
  overdue: 'bg-destructive/10 text-destructive',
  resolved: 'bg-green-500/10 text-green-500',
};
