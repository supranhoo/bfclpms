import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollText } from 'lucide-react';
import { format } from 'date-fns';
import { ReviewPeriodAuditEntry } from '@/hooks/useReviewPeriodGovernance';

interface Props {
  periodId: string;
  auditLog: ReviewPeriodAuditEntry[];
  loading: boolean;
}

const actionColors: Record<string, string> = {
  stage_changed: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  role_locked: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-200',
  role_unlocked: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  department_locked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  department_unlocked: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  employee_locked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  employee_unlocked: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  global_locked: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  global_unlocked: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  lock_deleted: 'bg-muted text-muted-foreground',
};

export default function ReviewPeriodAuditLog({ periodId, auditLog, loading }: Props) {
  // Fetch performer names
  const performerIds = [...new Set(auditLog.filter(e => e.performed_by).map(e => e.performed_by!))];

  const { data: performers } = useQuery({
    queryKey: ['audit-performers', performerIds.join(',')],
    queryFn: async () => {
      if (performerIds.length === 0) return {};
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', performerIds);
      const map: Record<string, string> = {};
      (data || []).forEach(p => { map[p.id] = p.full_name || p.email || 'Unknown'; });
      return map;
    },
    enabled: performerIds.length > 0,
  });

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-3">
          <ScrollText className="h-5 w-5 text-primary" />
          <div>
            <CardTitle className="text-base">Audit Log</CardTitle>
            <CardDescription>Full history of governance changes for this period</CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-sm text-muted-foreground text-center py-6">Loading audit log...</p>
        ) : auditLog.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-6">No audit entries yet.</p>
        ) : (
          <div className="max-h-[500px] overflow-y-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Action</TableHead>
                  <TableHead>Target</TableHead>
                  <TableHead>By</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead>Date</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {auditLog.map(entry => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <Badge className={actionColors[entry.action] || 'bg-muted text-muted-foreground'}>
                        {entry.action.replace(/_/g, ' ')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.target_type && (
                        <span className="text-muted-foreground">
                          {entry.target_type}: {entry.target_id?.substring(0, 8) || '—'}
                        </span>
                      )}
                      {!entry.target_type && '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {entry.performed_by ? (performers?.[entry.performed_by] || entry.performed_by.substring(0, 8)) : '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                      {entry.reason || '—'}
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                      {format(new Date(entry.created_at), 'dd MMM yyyy, hh:mm a')}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
