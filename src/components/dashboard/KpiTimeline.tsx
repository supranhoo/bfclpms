import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { statusLabels } from '@/lib/reviewConstants';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

import { 
  Clock, 
  FileText, 
  CheckCircle, 
  MessageSquare, 
  User, 
  AlertCircle,
  Shield,
  Edit,
  Send,
  Briefcase,
  Undo2,
  UserCog,
  ClipboardCheck,
  ChevronRight,
  ChevronDown
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { KPI } from '@/hooks/useKpis';
import { groupTimelineEvents, type TimelineLog } from '@/lib/timelineGrouping';

interface KpiTimelineProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
  workflowStages?: string[];
}

interface AuditLog {
  id: string;
  kpi_id: string;
  action: string;
  performed_by: string;
  on_behalf_of: string | null;
  on_behalf_role: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

interface Profile {
  id: string;
  full_name: string | null;
  email: string;
}

/**
 * Canonical workflow stages in order. Must mirror the keys in
 * src/lib/reviewConstants.ts → statusLabels. Exported so unit tests can
 * assert completeness; missing keys silently drop stages from the visual.
 */
export const ALL_WORKFLOW_STAGES: Array<{ key: string; label: string; icon: React.ElementType }> = [
  { key: 'kra_set',            label: 'KRA Set',     icon: FileText },
  { key: 'self_review',        label: 'Self Review', icon: Send },
  { key: 'manager_check',      label: 'Manager',     icon: User },
  { key: 'skip_level_check',   label: 'Skip-Level',  icon: UserCog },
  { key: 'hr_pms_review',      label: 'HR PMS',      icon: ClipboardCheck },
  { key: 'audit',              label: 'Audit',       icon: Shield },
  { key: 'management_review',  label: 'Management',  icon: Briefcase },
  { key: 'approved',           label: 'Approved',    icon: CheckCircle },
];

const actionConfig: Record<string, { icon: React.ElementType; color: string; label: string }> = {
  'SELF_REVIEW_SUBMITTED': { icon: Send, color: 'bg-blue-500', label: 'Self Review Submitted' },
  'MANAGER_APPROVED': { icon: CheckCircle, color: 'bg-green-500', label: 'Manager Approved' },
  'MANAGER_REVIEWED': { icon: User, color: 'bg-purple-500', label: 'Manager Reviewed' },
  'QUERY_RAISED': { icon: MessageSquare, color: 'bg-amber-500', label: 'Query Raised' },
  'QUERY_RESOLVED': { icon: CheckCircle, color: 'bg-emerald-500', label: 'Query Resolved' },
  'AUDITOR_REVIEWED': { icon: Shield, color: 'bg-indigo-500', label: 'Auditor Reviewed' },
  'AUDITOR_APPROVED': { icon: CheckCircle, color: 'bg-indigo-500', label: 'Auditor Approved' },
  'AUDITOR_SENT_BACK_TO_MANAGER': { icon: Undo2, color: 'bg-orange-500', label: 'Sent Back to Manager' },
  'AUDITOR_SENT_BACK_TO_EMPLOYEE': { icon: Undo2, color: 'bg-orange-500', label: 'Sent Back to Employee' },
  'MANAGEMENT_REVIEWED': { icon: Briefcase, color: 'bg-emerald-500', label: 'Management Reviewed' },
  'MANAGEMENT_APPROVED': { icon: CheckCircle, color: 'bg-emerald-600', label: 'Management Approved' },
  'MANAGEMENT_SENT_BACK_TO_AUDITOR': { icon: Undo2, color: 'bg-orange-500', label: 'Sent Back to Auditor' },
  'MANAGER_SENT_BACK_TO_EMPLOYEE': { icon: Undo2, color: 'bg-orange-500', label: 'Sent Back to Employee' },
  'MANAGEMENT_SENT_BACK_TO_MANAGER': { icon: Undo2, color: 'bg-orange-500', label: 'Sent Back to Manager' },
  'MANAGEMENT_SENT_BACK_TO_EMPLOYEE': { icon: Undo2, color: 'bg-orange-500', label: 'Sent Back to Employee' },
  'KPI_CREATED': { icon: FileText, color: 'bg-sky-500', label: 'KPI Created' },
  'KPI_UPDATED': { icon: Edit, color: 'bg-slate-500', label: 'KPI Updated' },
  'STATUS_CHANGED': { icon: AlertCircle, color: 'bg-orange-500', label: 'Status Changed' },
  'STATUS_TRANSITION': { icon: AlertCircle, color: 'bg-blue-400', label: 'Status Changed' },
  // N/A Confirmation actions
  'MANAGER_NA_CONFIRMED': { icon: CheckCircle, color: 'bg-amber-500', label: 'Manager Confirmed N/A' },
  'AUDITOR_NA_CONFIRMED': { icon: CheckCircle, color: 'bg-amber-500', label: 'Auditor Confirmed N/A' },
  'MANAGEMENT_NA_CONFIRMED': { icon: CheckCircle, color: 'bg-amber-500', label: 'Management Confirmed N/A' },
  // Admin Actions - Rose/Pink color theme for visibility
  'ADMIN_DATA_ENTRY_SELF': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Self Data' },
  'ADMIN_DATA_ENTRY_MANAGER': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Manager Data' },
  'ADMIN_DATA_ENTRY_AUDITOR': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Auditor Data' },
  'ADMIN_DATA_ENTRY_MANAGEMENT': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Entered Management Data' },
  'ADMIN_DAILY_ENTRY_OVERRIDE': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Daily Entry Override' },
  'ADMIN_STATUS_OVERRIDE': { icon: UserCog, color: 'bg-rose-600', label: 'Admin Status Override' },
  'ADMIN_OVERRIDE': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Override' },
  'MANAGER_DAILY_OVERRIDE': { icon: User, color: 'bg-purple-500', label: 'Manager Daily Override' },
  'ADMIN_STATUS_STEP_BACK': { icon: UserCog, color: 'bg-rose-600', label: 'Admin Status Step Back' },
  'AUDITOR_FORWARDED': { icon: CheckCircle, color: 'bg-indigo-500', label: 'Auditor Forwarded' },
  'MANAGER_FORWARDED': { icon: CheckCircle, color: 'bg-green-500', label: 'Manager Forwarded' },
  // Org KPI Propagation actions
  'ORG_KPI_PROPAGATED': { icon: Briefcase, color: 'bg-teal-500', label: 'Org KPI Data Entered' },
  'ORG_KPI_VALUE_UPDATED': { icon: Edit, color: 'bg-teal-500', label: 'Org KPI Value Updated' },
  // RCA fix actions
  'ADMIN_FAST_TRACK_APPROVED': { icon: UserCog, color: 'bg-rose-500', label: 'Admin Fast-Track Approved' },
  'DATA_REPAIR': { icon: Edit, color: 'bg-teal-500', label: 'Data Repair' },
  'SUBMISSION_SCORE_CHANGED': { icon: AlertCircle, color: 'bg-slate-500', label: 'Score Changed (Safety Net)' },
  'PERCOLATION_DEFERRED': { icon: Clock, color: 'bg-amber-500', label: 'Percolation Deferred' },
  'SCORE_PERCOLATED': { icon: CheckCircle, color: 'bg-teal-500', label: 'Score Percolated' },
  'RECONCILE_STATUS': { icon: AlertCircle, color: 'bg-orange-500', label: 'Status Reconciled' },
  'ADMIN_BULK_STEP_BACK': { icon: UserCog, color: 'bg-rose-600', label: 'Admin Bulk Step Back' },
  'SELF_REVIEW_RECALLED': { icon: Undo2, color: 'bg-blue-400', label: 'Self Review Recalled' },
};

export function KpiTimeline({ isOpen, onClose, kpi, workflowStages: propStages }: KpiTimelineProps) {
  // Fetch audit logs for this KPI
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['kpi-timeline', kpi?.id],
    queryFn: async () => {
      if (!kpi?.id) return [];
      
      const { data, error } = await supabase
        .from('kpi_audit_logs')
        .select('id, kpi_id, action, performed_by, on_behalf_of, on_behalf_role, old_value, new_value, metadata, created_at')
        .eq('kpi_id', kpi.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: !!kpi?.id && isOpen,
  });

  // Fetch profiles for both performed_by and on_behalf_of users
  const allUserIds = useMemo(() => {
    const performerIds = auditLogs.map(log => log.performed_by);
    const onBehalfIds = auditLogs.filter(log => log.on_behalf_of).map(log => log.on_behalf_of!);
    return [...new Set([...performerIds, ...onBehalfIds])];
  }, [auditLogs]);

  const { data: profiles = [] } = useQuery({
    queryKey: ['timeline-profiles', allUserIds],
    queryFn: async () => {
      if (allUserIds.length === 0) return [];
      
      const { data, error } = await supabase
        .rpc('get_profiles_for_audit_display', { p_user_ids: allUserIds });

      if (error) throw error;
      return (data ?? []) as Profile[];
    },
    enabled: allUserIds.length > 0,
  });

  const profileMap = useMemo(() => 
    new Map(profiles.map(p => [p.id, p])),
    [profiles]
  );

  // Track which transaction groups have their system-cascade children expanded.
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set());
  const toggleGroup = (id: string) => {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // Collapse same-transaction trigger/reconcile rows under their human parent.
  const groupedEvents = useMemo(
    () => groupTimelineEvents(auditLogs as unknown as TimelineLog[]),
    [auditLogs],
  );

  const getActionConfig = (action: string) => {
    return actionConfig[action] || { 
      icon: Clock, 
      color: 'bg-muted-foreground', 
      label: action.replace(/_/g, ' ') 
    };
  };

  const formatDetails = (log: AuditLog) => {
    const details: string[] = [];
    
    // Admin reason from metadata (priority display)
    if (log.metadata?.reason) details.push(`Admin Reason: ${String(log.metadata.reason)}`);
    
    if (log.new_value) {
      // Org KPI propagation details
      if (log.new_value.source === 'org_kpi_data_owner') {
        if (log.new_value.is_na) {
          details.push('Marked as N/A');
        } else if (log.new_value.achieved_value !== undefined && log.new_value.achieved_value !== null) {
          details.push(`Achieved Value: ${log.new_value.achieved_value}`);
        }
        if (log.new_value.self_score) details.push(`Score: ${log.new_value.self_score}`);
        if (log.new_value.self_rating) details.push(`Rating: ${log.new_value.self_rating}`);
      } else {
        if (log.new_value.self_score) details.push(`Self Score: ${log.new_value.self_score}`);
        if (log.new_value.manager_score) details.push(`Manager Score: ${log.new_value.manager_score}`);
        if (log.new_value.auditor_score) details.push(`Auditor Score: ${log.new_value.auditor_score}`);
        if (log.new_value.management_score) details.push(`Management Score: ${log.new_value.management_score}`);
        if (log.new_value.self_rating) details.push(`Rating: ${log.new_value.self_rating}`);
        if (log.new_value.manager_rating) details.push(`Rating: ${log.new_value.manager_rating}`);
        if (log.new_value.auditor_rating) details.push(`Rating: ${log.new_value.auditor_rating}`);
        if (log.new_value.management_rating) details.push(`Rating: ${log.new_value.management_rating}`);
      }
      if (log.new_value.reason) details.push(`Reason: ${log.new_value.reason}`);
      if (log.new_value.resolution_notes) details.push(`Resolution: ${log.new_value.resolution_notes}`);
      if (log.new_value.target) details.push(`Sent to: ${log.new_value.target}`);
      if (log.new_value.status) {
        const label = statusLabels[String(log.new_value.status)] || String(log.new_value.status).replace(/_/g, ' ');
        details.push(`New Status: ${label}`);
      }
      if (log.new_value.na_remarks) details.push(`N/A Remarks: ${log.new_value.na_remarks}`);
      if (log.new_value.self_remarks) details.push(`Self Remarks: ${log.new_value.self_remarks}`);
      if (log.new_value.manager_remarks) details.push(`Manager Remarks: ${log.new_value.manager_remarks}`);
      if (log.new_value.auditor_remarks) details.push(`Auditor Remarks: ${log.new_value.auditor_remarks}`);
      if (log.new_value.management_remarks) details.push(`Management Remarks: ${log.new_value.management_remarks}`);
    }
    
    return details;
  };

  // Filter the canonical stage list down to the resolved workflow chain
  // for this employee/period; fall back to the full list when not provided.
  const workflowStages = propStages
    ? ALL_WORKFLOW_STAGES.filter(s => propStages.includes(s.key))
    : ALL_WORKFLOW_STAGES;

  const currentStageIndex = workflowStages.findIndex(s => s.key === kpi?.status);

  if (!kpi) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col overflow-hidden p-4 sm:p-6">
        <DialogHeader className="shrink-0">
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Review Timeline
          </DialogTitle>
          <DialogDescription className="line-clamp-1">
            {kpi.kra_name}
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
          {/* Workflow Progress */}
          <div className="shrink-0 mb-4 p-4 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-3">Workflow Progress</p>
            <div className="flex items-center gap-0">
              {workflowStages.map((stage, index) => {
                const StageIcon = stage.icon;
                const isCompleted = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;
                
                return (
                  <div key={stage.key} className="contents">
                    <div className="flex flex-col items-center min-w-[32px] sm:min-w-[48px]">
                      <div
                        className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center ${
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : isCurrent
                            ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <StageIcon className="h-3 w-3 sm:h-4 sm:w-4" />
                      </div>
                      <span className={`hidden sm:block text-xs mt-1 text-center ${isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                        {stage.label}
                      </span>
                    </div>
                    {index < workflowStages.length - 1 && (
                      <div className={`h-0.5 flex-1 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="shrink-0 flex flex-wrap items-center gap-2 mb-4">
            <Badge variant="outline" className="max-w-[150px] truncate">{kpi.kra_name}</Badge>
            <Badge variant="secondary">{kpi.review_period} {kpi.review_year}</Badge>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto pr-4">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-muted-foreground">
                Loading timeline...
              </div>
            ) : auditLogs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                <Clock className="h-12 w-12 mb-3 opacity-50" />
                <p>No activity recorded yet</p>
                <p className="text-sm">Actions will appear here as they occur</p>
              </div>
            ) : (
              <div className="relative">
                {/* Timeline line */}
                <div className="absolute left-[18px] top-0 bottom-0 w-0.5 bg-border" />
                
                <div className="space-y-6">
                {auditLogs.map((log, index) => {
                    const config = getActionConfig(log.action);
                    const IconComponent = config.icon;
                    const performer = profileMap.get(log.performed_by);
                    const onBehalfProfile = log.on_behalf_of ? profileMap.get(log.on_behalf_of) : null;
                    const details = formatDetails(log);
                    
                    return (
                      <div key={log.id} className="relative pl-11">
                        {/* Timeline dot */}
                        <div className={`absolute left-[9px] w-5 h-5 rounded-full ${config.color} flex items-center justify-center ring-4 ring-background`}>
                          <IconComponent className="h-3 w-3 text-white" />
                        </div>
                        
                        <div className="bg-card border rounded-lg p-4 shadow-sm">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 sm:gap-4">
                            <div className="flex-1">
                              <h4 className="font-medium text-foreground">
                                {config.label}
                              </h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                by {log.performed_by ? (performer?.full_name || performer?.email || 'Unknown user') : (
                                  <span className="inline-flex items-center gap-1 text-muted-foreground font-medium">
                                    <span className="px-1.5 py-0.5 rounded bg-muted text-xs">System</span>
                                  </span>
                                )}
                                {log.on_behalf_of && onBehalfProfile && (
                                  <span className="text-rose-600 dark:text-rose-400">
                                    {' '}(on behalf of {onBehalfProfile.full_name || onBehalfProfile.email})
                                  </span>
                                )}
                              </p>
                              
                              {details.length > 0 && (
                                <div className="mt-2 space-y-1">
                                  {details.map((detail, i) => (
                                    <p key={i} className="text-sm text-muted-foreground">
                                      • {detail}
                                    </p>
                                  ))}
                                </div>
                              )}
                            </div>
                            
                            <time className="text-xs text-muted-foreground sm:whitespace-nowrap text-left sm:text-right">
                              {format(new Date(log.created_at), 'dd MMM yyyy, hh:mm a')}
                            </time>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="shrink-0 flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
