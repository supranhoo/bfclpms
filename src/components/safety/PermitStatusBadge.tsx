import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  SAFETY_PERMIT_STATUS_LABEL,
  SAFETY_PERMIT_STATUS_TONE,
  isPermitLive,
  type SafetyPermitStatus,
} from '@/lib/safetyPermits';

/**
 * Status badge for Safety Permits — uses semantic Tailwind tokens via the
 * shadcn Badge variants, plus a soft pulse for live statuses.
 */
export function PermitStatusBadge({
  status,
  className,
}: {
  status: SafetyPermitStatus;
  className?: string;
}) {
  return (
    <Badge
      variant={SAFETY_PERMIT_STATUS_TONE[status]}
      className={cn(isPermitLive(status) && 'animate-pulse', className)}
    >
      {SAFETY_PERMIT_STATUS_LABEL[status]}
    </Badge>
  );
}