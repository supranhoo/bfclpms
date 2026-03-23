import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { FileText } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface Props {
  fiscalStartYear: number;
  selectedMonths: string[];
}

export function RecentAuditLog({ fiscalStartYear, selectedMonths }: Props) {
  // Compute date range from selected months
  const dateRange = (() => {
    const pairs = selectedMonths.map(month => {
      const monthIndex = MONTHS.indexOf(month);
      const calendarYear = monthIndex >= 6 ? fiscalStartYear : fiscalStartYear + 1;
      return { monthIndex, calendarYear };
    });
    if (pairs.length === 0) return null;
    const sorted = [...pairs].sort((a, b) => a.calendarYear - b.calendarYear || a.monthIndex - b.monthIndex);
    const first = sorted[0];
    const last = sorted[sorted.length - 1];
    const startDate = new Date(first.calendarYear, first.monthIndex, 1).toISOString();
    const endDate = new Date(last.calendarYear, last.monthIndex + 1, 0, 23, 59, 59).toISOString();
    return { startDate, endDate };
  })();

  const { data: logs } = useQuery({
    queryKey: ['recent-audit-logs', fiscalStartYear, selectedMonths],
    queryFn: async () => {
      let query = supabase
        .from('kpi_audit_logs')
        .select(`
          id,
          action,
          created_at,
          kpi:kpis!kpi_audit_logs_kpi_id_fkey(kpi_name, employee_id),
          performer:profiles!kpi_audit_logs_performed_by_fkey(full_name)
        `)
        .order('created_at', { ascending: false })
        .limit(10);

      if (dateRange) {
        query = query.gte('created_at', dateRange.startDate).lte('created_at', dateRange.endDate);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Fetch employee names for the KPIs
      const empIds = [...new Set((data || []).map((l: any) => l.kpi?.employee_id).filter(Boolean))];
      let empMap: Record<string, string> = {};
      if (empIds.length > 0) {
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name')
          .in('id', empIds);
        (profiles || []).forEach(p => { empMap[p.id] = p.full_name || 'Unknown'; });
      }

      return (data || []).map((l: any) => ({
        id: l.id,
        action: l.action,
        createdAt: l.created_at,
        performer: l.performer?.full_name || 'System',
        kpiName: l.kpi?.kpi_name || '-',
        employeeName: l.kpi?.employee_id ? empMap[l.kpi.employee_id] || '-' : '-',
      }));
    },
  });

  const formatAction = (action: string) => {
    return action.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="h-5 w-5" />
          Recent Audit Log
        </CardTitle>
        <CardDescription>Latest KPI changes</CardDescription>
      </CardHeader>
      <CardContent>
        {!logs || logs.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No recent activity</p>
        ) : (
          <ScrollArea className="h-[250px]">
            <div className="space-y-3">
              {logs.map((log) => (
                <div key={log.id} className="flex gap-3 text-sm border-l-2 border-muted pl-3 py-1">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{formatAction(log.action)}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {log.kpiName} • {log.employeeName}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      by {log.performer} • {formatDistanceToNow(new Date(log.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}
