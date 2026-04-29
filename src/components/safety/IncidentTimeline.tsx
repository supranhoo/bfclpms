import { Loader2 } from 'lucide-react';
import { useIncidentTimeline } from '@/hooks/useSafetyIncidentDetail';
import { SAFETY_STATUS_LABELS } from '@/lib/safetyIncidents';
import { format } from 'date-fns';

export function IncidentTimeline({ incidentId }: { incidentId: string }) {
  const { data: rows = [], isLoading } = useIncidentTimeline(incidentId);
  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No status changes yet.</p>;
  }
  return (
    <ol className="relative border-l border-border ml-3 space-y-4">
      {rows.map((r) => (
        <li key={r.id} className="ml-4">
          <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
          <p className="text-sm font-medium">
            {r.from_status ? `${SAFETY_STATUS_LABELS[r.from_status]} → ` : ''}
            {SAFETY_STATUS_LABELS[r.to_status]}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}
          </p>
          {r.notes && <p className="text-sm text-muted-foreground mt-1">{r.notes}</p>}
        </li>
      ))}
    </ol>
  );
}