import { Badge } from '@/components/ui/badge';
import { SLA_BADGE_VARIANT, type SlaState } from '@/lib/safetyIncidents';

const LABEL: Record<SlaState, string> = {
  green: 'On track',
  amber: 'At risk',
  red: 'Overdue',
  closed: 'Closed',
};

export function SlaBadge({ state }: { state: SlaState }) {
  return (
    <Badge variant={SLA_BADGE_VARIANT[state]} className="capitalize">
      {LABEL[state]}
    </Badge>
  );
}