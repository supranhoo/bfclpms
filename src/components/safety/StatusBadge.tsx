import { Badge } from '@/components/ui/badge';
import { SAFETY_STATUS_LABELS, type SafetyIncidentStatus } from '@/lib/safetyIncidents';

export function SafetyStatusBadge({ status }: { status: SafetyIncidentStatus }) {
  const variant: 'default' | 'secondary' | 'destructive' | 'outline' =
    status === 'closed' ? 'outline'
    : status === 'orphaned' ? 'destructive'
    : status === 'reported' ? 'secondary'
    : 'default';
  return <Badge variant={variant}>{SAFETY_STATUS_LABELS[status]}</Badge>;
}