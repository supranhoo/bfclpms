import { useState } from 'react';
import { useObservationsByKpis, KpiObservation } from '@/hooks/useKpiObservations';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Eye, ChevronDown, ChevronRight, MessageSquare } from 'lucide-react';
import { format } from 'date-fns';

interface OrgKpiObservationsSummaryProps {
  kpiIds: string[];
}

const typeConfig: Record<string, { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  concern: { label: 'Concern', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  neutral: { label: 'Neutral', className: 'bg-muted text-muted-foreground' },
};

const statusConfig: Record<string, { label: string; variant: 'outline' | 'secondary' | 'default' }> = {
  open: { label: 'Open', variant: 'outline' },
  acknowledged: { label: 'Acknowledged', variant: 'secondary' },
  resolved: { label: 'Resolved', variant: 'default' },
};

export function OrgKpiObservationsSummary({ kpiIds }: OrgKpiObservationsSummaryProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: observationMap, isLoading } = useObservationsByKpis(kpiIds);

  // Flatten all observations
  const allObservations: KpiObservation[] = [];
  observationMap?.forEach(obs => allObservations.push(...obs));

  if (isLoading || allObservations.length === 0) return null;

  // Group by target employee (KPI owner) instead of observer
  const grouped = new Map<string, { name: string; observations: KpiObservation[] }>();
  allObservations.forEach(obs => {
    const employeeId = obs.kpi?.employee_id || obs.created_by;
    const employeeName = obs.kpi?.employee_profile?.full_name || obs.kpi?.employee_profile?.email || 'Unknown Employee';
    const existing = grouped.get(employeeId) || { name: employeeName, observations: [] };
    existing.observations.push(obs);
    grouped.set(employeeId, existing);
  });

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <CollapsibleTrigger asChild>
        <Button variant="ghost" size="sm" className="justify-start gap-2 text-sm w-full">
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          <Eye className="h-4 w-4" />
          Employee Observations
          <Badge variant="secondary" className="text-xs ml-1">
            {allObservations.length}
          </Badge>
        </Button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="border rounded-lg mt-2 divide-y max-h-[400px] overflow-y-auto">
          {Array.from(grouped.entries()).map(([userId, { name, observations }]) => (
            <div key={userId} className="p-3 space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-muted-foreground">{name}</span>
                <Badge variant="outline" className="text-xs h-4 px-1.5 font-normal">
                  {observations.length} observation{observations.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <div className="space-y-1.5">
                {observations.map(obs => {
                  const type = typeConfig[obs.observation_type] || typeConfig.neutral;
                  const status = statusConfig[obs.status] || statusConfig.open;
                  return (
                    <div key={obs.id} className="flex items-start gap-2 text-xs bg-muted/30 rounded-md p-2">
                      <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                      <div className="flex-1 min-w-0 space-y-0.5">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${type.className}`}>
                            {type.label}
                          </span>
                          <Badge variant={status.variant} className="text-[10px] h-4 px-1.5">
                            {status.label}
                          </Badge>
                          {(obs as any).ticket_number && (
                            <span className="text-muted-foreground">{(obs as any).ticket_number}</span>
                          )}
                          {obs.created_by_profile && (
                            <span className="text-muted-foreground">
                              · Raised by: {obs.created_by_profile.full_name || obs.created_by_profile.email}
                            </span>
                          )}
                        </div>
                        <p className="font-medium text-foreground leading-tight">{obs.title}</p>
                        {obs.description && (
                          <p className="text-muted-foreground line-clamp-2">{obs.description}</p>
                        )}
                        <p className="text-muted-foreground">
                          {format(new Date(obs.created_at!), 'dd MMM yyyy')}
                          {obs.observer_role && ` · ${obs.observer_role}`}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}
