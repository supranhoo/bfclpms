import { useOrgKpiAuditLog } from '@/hooks/useOrgKpiAuditLog';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { History, Loader2 } from 'lucide-react';
import { format } from 'date-fns';

interface OrgKpiAuditLogProps {
  categoryId: string;
  kraName: string;
  kpiName: string;
  reviewPeriod: string;
  reviewYear: number;
}

const actionLabels: Record<string, { label: string; variant: 'default' | 'secondary' | 'outline' }> = {
  created: { label: 'Created', variant: 'default' },
  updated: { label: 'Updated', variant: 'secondary' },
  imported: { label: 'Imported', variant: 'outline' },
  copied_from_previous: { label: 'Copied', variant: 'outline' },
  propagated: { label: 'Propagated', variant: 'default' },
  rollback: { label: 'Rollback', variant: 'secondary' },
  unlocked: { label: 'Unlocked', variant: 'outline' },
};

export function OrgKpiAuditLog({ categoryId, kraName, kpiName, reviewPeriod, reviewYear }: OrgKpiAuditLogProps) {
  const { data: logs, isLoading } = useOrgKpiAuditLog(categoryId, kraName, kpiName, reviewPeriod, reviewYear);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1">
          <History className="h-3.5 w-3.5" />
          History
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="p-3 border-b">
          <h4 className="text-sm font-medium">Value History</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{kpiName}</p>
        </div>
        <ScrollArea className="h-[250px]">
          {isLoading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !logs || logs.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No history yet
            </div>
          ) : (
            <div className="p-2 space-y-2">
              {logs.map(log => {
                const actionInfo = actionLabels[log.action] || { label: log.action, variant: 'outline' as const };
                return (
                  <div key={log.id} className="flex items-start gap-2 p-2 rounded-lg bg-muted/30 text-xs">
                    <div className="flex-1 space-y-1">
                      <div className="flex items-center gap-2">
                        <Badge variant={actionInfo.variant} className="text-[10px] px-1.5 py-0">
                          {actionInfo.label}
                        </Badge>
                        <span className="text-muted-foreground">
                          {format(new Date(log.created_at), 'dd MMM yyyy HH:mm')}
                        </span>
                      </div>
                      <div className="text-foreground">
                        {log.old_value !== null && log.new_value !== null ? (
                          <span>{log.old_value} → {log.new_value}</span>
                        ) : log.new_value !== null ? (
                          <span>Set to {log.new_value}</span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </div>
                      <div className="text-muted-foreground">
                        {(log.performer as any)?.full_name || (log.performer as any)?.email || 'System'}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
