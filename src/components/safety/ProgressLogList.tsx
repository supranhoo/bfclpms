import { Loader2 } from 'lucide-react';
import { useIncidentProgress } from '@/hooks/useSafetyIncidentDetail';
import { SAFETY_STATUS_LABELS } from '@/lib/safetyIncidents';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';

export function ProgressLogList({ incidentId }: { incidentId: string }) {
  const { data: rows = [], isLoading } = useIncidentProgress(incidentId);
  if (isLoading) return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">No progress logged yet.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((r) => (
        <li key={r.id} className="bg-muted/40 rounded p-3 text-sm">
          <div className="flex items-center justify-between mb-1">
            <Badge variant="outline">{SAFETY_STATUS_LABELS[r.stage]}</Badge>
            <span className="text-xs text-muted-foreground">
              {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}
            </span>
          </div>
          <p className="whitespace-pre-wrap">{r.note}</p>
        </li>
      ))}
    </ul>
  );
}