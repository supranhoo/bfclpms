import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Timer } from 'lucide-react';
import { format, formatDistanceToNowStrict } from 'date-fns';
import {
  SAFETY_PRIORITY_LABELS,
  SAFETY_SLA_STATUS_LABELS,
  SAFETY_SLA_STATUS_TONE,
} from '@/lib/safetyIncidents';
import type { SafetyIncidentRow } from '@/hooks/useSafetyIncidents';

/**
 * IncidentSlaPanel — read-only view of the SLA window stamped on the
 * incident at report time. Values are historically immutable (the
 * `sla_due_at` snapshot doesn't change if admins later edit the rule).
 */
export function IncidentSlaPanel({ incident }: { incident: SafetyIncidentRow }) {
  if (!incident.sla_due_at) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Timer className="h-4 w-4" /> SLA
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground">
          No SLA rule matched this incident at the time it was reported.
          Configure rules in Safety Settings → SLA Configuration.
        </CardContent>
      </Card>
    );
  }

  const due = new Date(incident.sla_due_at);
  const start = incident.sla_start_at ? new Date(incident.sla_start_at) : null;
  const closed = incident.closed_at ? new Date(incident.closed_at) : null;
  const status = incident.sla_status ?? 'on_track';
  const tone = SAFETY_SLA_STATUS_TONE[status];

  const breachedBy =
    status === 'overdue' || status === 'closed_late'
      ? formatDistanceToNowStrict(due, { addSuffix: false })
      : null;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between">
        <CardTitle className="text-base flex items-center gap-2">
          <Timer className="h-4 w-4" /> SLA
        </CardTitle>
        <Badge variant={tone}>{SAFETY_SLA_STATUS_LABELS[status]}</Badge>
      </CardHeader>
      <CardContent className="text-sm space-y-2">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <p className="text-xs text-muted-foreground">Target</p>
            <p>{incident.sla_target_hours ?? '—'} hours</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Priority</p>
            <p>{incident.priority ? SAFETY_PRIORITY_LABELS[incident.priority] : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Started</p>
            <p>{start ? format(start, 'dd MMM yyyy, HH:mm') : '—'}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Due</p>
            <p>{format(due, 'dd MMM yyyy, HH:mm')}</p>
          </div>
          {closed ? (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">Closed</p>
              <p>{format(closed, 'dd MMM yyyy, HH:mm')}</p>
            </div>
          ) : (
            <div className="col-span-2">
              <p className="text-xs text-muted-foreground">
                {due > new Date() ? 'Time remaining' : 'Overdue by'}
              </p>
              <p>{formatDistanceToNowStrict(due, { addSuffix: false })}</p>
            </div>
          )}
          {breachedBy && (
            <div className="col-span-2 text-destructive">
              SLA breached by {breachedBy}.
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}