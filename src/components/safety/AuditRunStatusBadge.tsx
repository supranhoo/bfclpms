import { Badge } from '@/components/ui/badge';
import {
  SAFETY_AUDIT_RUN_STATUS_LABEL,
  SAFETY_AUDIT_RUN_STATUS_TONE,
  type SafetyAuditRunStatus,
} from '@/lib/safetyAudits';

export function AuditRunStatusBadge({ status }: { status: SafetyAuditRunStatus }) {
  return (
    <Badge variant={SAFETY_AUDIT_RUN_STATUS_TONE[status]} className="text-[11px]">
      {SAFETY_AUDIT_RUN_STATUS_LABEL[status]}
    </Badge>
  );
}