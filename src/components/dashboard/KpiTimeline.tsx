import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
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
  Undo2
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import type { KPI } from '@/hooks/useKpis';

interface KpiTimelineProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
}

interface AuditLog {
  id: string;
  kpi_id: string;
  action: string;
  performed_by: string;
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
};

export function KpiTimeline({ isOpen, onClose, kpi }: KpiTimelineProps) {
  // Fetch audit logs for this KPI
  const { data: auditLogs = [], isLoading } = useQuery({
    queryKey: ['kpi-timeline', kpi?.id],
    queryFn: async () => {
      if (!kpi?.id) return [];
      
      const { data, error } = await supabase
        .from('kpi_audit_logs')
        .select('*')
        .eq('kpi_id', kpi.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as AuditLog[];
    },
    enabled: !!kpi?.id && isOpen,
  });

  // Fetch profiles for performed_by users
  const performerIds = useMemo(() => 
    [...new Set(auditLogs.map(log => log.performed_by))],
    [auditLogs]
  );

  const { data: profiles = [] } = useQuery({
    queryKey: ['timeline-profiles', performerIds],
    queryFn: async () => {
      if (performerIds.length === 0) return [];
      
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', performerIds);

      if (error) throw error;
      return data as Profile[];
    },
    enabled: performerIds.length > 0,
  });

  const profileMap = useMemo(() => 
    new Map(profiles.map(p => [p.id, p])),
    [profiles]
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
    
    if (log.new_value) {
      if (log.new_value.self_score) details.push(`Self Score: ${log.new_value.self_score}`);
      if (log.new_value.manager_score) details.push(`Manager Score: ${log.new_value.manager_score}`);
      if (log.new_value.auditor_score) details.push(`Auditor Score: ${log.new_value.auditor_score}`);
      if (log.new_value.management_score) details.push(`Management Score: ${log.new_value.management_score}`);
      if (log.new_value.self_rating) details.push(`Rating: ${log.new_value.self_rating}`);
      if (log.new_value.manager_rating) details.push(`Rating: ${log.new_value.manager_rating}`);
      if (log.new_value.auditor_rating) details.push(`Rating: ${log.new_value.auditor_rating}`);
      if (log.new_value.management_rating) details.push(`Rating: ${log.new_value.management_rating}`);
      if (log.new_value.reason) details.push(`Reason: ${log.new_value.reason}`);
      if (log.new_value.resolution_notes) details.push(`Resolution: ${log.new_value.resolution_notes}`);
      if (log.new_value.target) details.push(`Sent to: ${log.new_value.target}`);
      if (log.new_value.status) details.push(`New Status: ${log.new_value.status}`);
      // N/A confirmation details
      if (log.new_value.na_remarks) details.push(`N/A Remarks: ${log.new_value.na_remarks}`);
      // Reviewer remarks
      if (log.new_value.self_remarks) details.push(`Self Remarks: ${log.new_value.self_remarks}`);
      if (log.new_value.manager_remarks) details.push(`Manager Remarks: ${log.new_value.manager_remarks}`);
      if (log.new_value.auditor_remarks) details.push(`Auditor Remarks: ${log.new_value.auditor_remarks}`);
      if (log.new_value.management_remarks) details.push(`Management Remarks: ${log.new_value.management_remarks}`);
    }
    
    return details;
  };

  // Workflow stages
  const workflowStages = [
    { key: 'kra_set', label: 'KRA Set', icon: FileText },
    { key: 'self_review', label: 'Self Review', icon: Send },
    { key: 'manager_check', label: 'Manager', icon: User },
    { key: 'audit', label: 'Audit', icon: Shield },
    { key: 'management_review', label: 'Management', icon: Briefcase },
    { key: 'approved', label: 'Approved', icon: CheckCircle },
  ];

  const currentStageIndex = workflowStages.findIndex(s => s.key === kpi?.status);

  if (!kpi) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-2xl max-h-[85vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Clock className="h-5 w-5" />
            Review Timeline
          </DialogTitle>
          <DialogDescription>
            Complete history for <span className="font-medium">{kpi.kpi_name}</span>
          </DialogDescription>
        </DialogHeader>

        <div className="py-2">
          {/* Workflow Progress */}
          <div className="mb-6 p-4 bg-muted/50 rounded-lg">
            <p className="text-xs font-medium text-muted-foreground mb-3">Workflow Progress</p>
            <div className="flex items-center justify-between gap-1">
              {workflowStages.map((stage, index) => {
                const StageIcon = stage.icon;
                const isCompleted = index < currentStageIndex;
                const isCurrent = index === currentStageIndex;
                const isPending = index > currentStageIndex;
                
                return (
                  <div key={stage.key} className="flex items-center flex-1">
                    <div className="flex flex-col items-center flex-1">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center ${
                          isCompleted
                            ? 'bg-green-500 text-white'
                            : isCurrent
                            ? 'bg-primary text-primary-foreground ring-2 ring-primary/30'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        <StageIcon className="h-4 w-4" />
                      </div>
                      <span className={`text-xs mt-1 text-center ${isCurrent ? 'font-medium text-foreground' : 'text-muted-foreground'}`}>
                        {stage.label}
                      </span>
                    </div>
                    {index < workflowStages.length - 1 && (
                      <div className={`h-0.5 flex-1 mx-1 ${isCompleted ? 'bg-green-500' : 'bg-muted'}`} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-2 mb-4">
            <Badge variant="outline">{kpi.kra_name}</Badge>
            <Badge variant="secondary">{kpi.review_period} {kpi.review_year}</Badge>
          </div>

          <ScrollArea className="h-[500px] pr-4">
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
                <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-border" />
                
                <div className="space-y-6">
                  {auditLogs.map((log, index) => {
                    const config = getActionConfig(log.action);
                    const IconComponent = config.icon;
                    const performer = profileMap.get(log.performed_by);
                    const details = formatDetails(log);
                    
                    return (
                      <div key={log.id} className="relative pl-10">
                        {/* Timeline dot */}
                        <div className={`absolute left-2 w-5 h-5 rounded-full ${config.color} flex items-center justify-center ring-4 ring-background`}>
                          <IconComponent className="h-3 w-3 text-white" />
                        </div>
                        
                        <div className="bg-card border rounded-lg p-4 shadow-sm">
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex-1">
                              <h4 className="font-medium text-foreground">
                                {config.label}
                              </h4>
                              <p className="text-sm text-muted-foreground mt-1">
                                by {performer?.full_name || performer?.email || 'Unknown user'}
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
                            
                            <time className="text-xs text-muted-foreground whitespace-nowrap">
                              {format(new Date(log.created_at), 'dd MMM yyyy')}
                              <br />
                              {format(new Date(log.created_at), 'hh:mm a')}
                            </time>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </ScrollArea>
        </div>

        <div className="flex justify-end pt-2 border-t">
          <Button variant="outline" onClick={onClose}>Close</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
