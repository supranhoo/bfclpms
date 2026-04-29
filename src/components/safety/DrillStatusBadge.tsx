import { Badge } from '@/components/ui/badge';
import {
  SAFETY_DRILL_STATUS_LABEL,
  SAFETY_DRILL_STATUS_TONE,
  type SafetyDrillStatus,
} from '@/lib/safetyEmergency';

export function DrillStatusBadge({ status }: { status: SafetyDrillStatus }) {
  return (
    <Badge variant={SAFETY_DRILL_STATUS_TONE[status]}>
      {SAFETY_DRILL_STATUS_LABEL[status]}
    </Badge>
  );
}
