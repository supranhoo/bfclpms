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
  Send
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
  'KPI_CREATED': { icon: FileText, color: 'bg-sky-500', label: 'KPI Created' },
  'KPI_UPDATED': { icon: Edit, color: 'bg-slate-500', label: 'KPI Updated' },
  'STATUS_CHANGED': { icon: AlertCircle, color: 'bg-orange-500', label: 'Status Changed' },
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
      if (log.new_value.self_rating) details.push(`Rating: ${log.new_value.self_rating}`);
      if (log.new_value.manager_rating) details.push(`Rating: ${log.new_value.manager_rating}`);
      if (log.new_value.reason) details.push(`Reason: ${log.new_value.reason}`);
      if (log.new_value.resolution_notes) details.push(`Resolution: ${log.new_value.resolution_notes}`);
    }
    
    return details;
  };

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
                              {format(new Date(log.created_at), 'MMM d, yyyy')}
                              <br />
                              {format(new Date(log.created_at), 'h:mm a')}
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
