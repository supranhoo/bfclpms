import { useOrgKpiValueHistory } from '@/hooks/useOrgKpiValueHistory';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, History, ArrowRight } from 'lucide-react';
import { format } from 'date-fns';

interface Props {
  categoryId?: string;
  kraName?: string;
  kpiName?: string;
  reviewPeriod?: string;
  reviewYear?: number;
}

const changeTypeLabels: Record<string, string> = {
  create: 'Created',
  update: 'Updated',
  status_change: 'Status Changed',
  propagation: 'Propagated',
};

const changeTypeColors: Record<string, string> = {
  create: 'bg-primary/10 text-primary',
  update: 'bg-accent text-accent-foreground',
  status_change: 'bg-secondary text-secondary-foreground',
  propagation: 'bg-primary/20 text-primary',
};

export function OrgKpiHistoryTimeline({ categoryId, kraName, kpiName, reviewPeriod, reviewYear }: Props) {
  const { data: history, isLoading } = useOrgKpiValueHistory(categoryId, kraName, kpiName, reviewPeriod, reviewYear);

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!history || history.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <History className="h-8 w-8 mx-auto mb-2 opacity-50" />
        <p className="text-sm">No change history yet</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {history.map((entry) => (
        <Card key={entry.id} className="border-l-4" style={{ borderLeftColor: entry.change_type === 'propagation' ? 'hsl(var(--primary))' : undefined }}>
          <CardContent className="py-3 px-4">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Badge className={changeTypeColors[entry.change_type] || ''} variant="secondary">
                    {changeTypeLabels[entry.change_type] || entry.change_type}
                  </Badge>
                  {entry.change_type !== 'create' && (
                    <span className="text-sm font-medium">{entry.kpi_name}</span>
                  )}
                  {entry.change_type === 'create' && (
                    <span className="text-sm font-medium">{entry.kra_name} → {entry.kpi_name}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  {entry.old_achieved_value !== null && entry.new_achieved_value !== null && (
                    <span className="flex items-center gap-1">
                      {entry.old_achieved_value}
                      <ArrowRight className="h-3 w-3" />
                      {entry.new_achieved_value}
                    </span>
                  )}
                  {entry.old_achieved_value === null && entry.new_achieved_value !== null && (
                    <span>Value set to {entry.new_achieved_value}</span>
                  )}
                  {entry.propagated_count > 0 && (
                    <Badge variant="outline" className="text-xs">
                      {entry.propagated_count} employees
                    </Badge>
                  )}
                </div>
                {entry.old_status && entry.new_status && entry.old_status !== entry.new_status && (
                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                    Status: {entry.old_status} <ArrowRight className="h-3 w-3" /> {entry.new_status}
                  </div>
                )}
              </div>
              <div className="text-right text-xs text-muted-foreground shrink-0 ml-4">
                <div>{format(new Date(entry.created_at), 'dd MMM yyyy')}</div>
                <div>{format(new Date(entry.created_at), 'HH:mm')}</div>
                {entry.changed_by_profile ? (
                  <div className="mt-1 font-medium text-foreground">
                    {(entry.changed_by_profile as any)?.full_name}
                  </div>
                ) : (
                  <div className="mt-1 font-medium text-muted-foreground text-xs">System</div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
