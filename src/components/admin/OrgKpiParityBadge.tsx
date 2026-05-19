import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { CheckCircle2, AlertTriangle, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { OrgKpiEvidenceParityRow } from '@/hooks/useOrgKpiEvidenceFiles';

interface Props {
  parity: OrgKpiEvidenceParityRow | undefined;
  className?: string;
  onClick?: () => void;
}

/**
 * Per-OKV parity badge: "In sync" / "N drift" / "N pending".
 * Drives Q4 of the evidence brainstorm — surfaces whether the OKV editor
 * view matches what each mapped employee currently sees on their dashboard.
 */
export function OrgKpiParityBadge({ parity, className, onClick }: Props) {
  if (!parity || parity.total_emps === 0) return null;

  const drift = parity.drift_value + parity.drift_evidence;
  const inSync = parity.in_sync;
  const pending = parity.not_propagated;

  let label: string;
  let icon = CheckCircle2;
  let tone =
    'text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800';

  if (drift > 0) {
    label = `Drift: ${drift}/${parity.total_emps}`;
    icon = AlertTriangle;
    tone =
      'text-orange-700 border-orange-300 bg-orange-50 dark:text-orange-300 dark:bg-orange-950/30 dark:border-orange-800';
  } else if (pending > 0 && inSync === 0) {
    label = `Pending: ${pending}/${parity.total_emps}`;
    icon = Clock;
    tone = 'text-muted-foreground border-muted-foreground/30';
  } else {
    label = `In sync: ${inSync}/${parity.total_emps}`;
  }

  const Icon = icon;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            onClick={onClick}
            className={cn('gap-1 text-[10px] font-medium cursor-pointer', tone, className)}
          >
            <Icon className="h-3 w-3" />
            {label}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="bottom" className="text-xs max-w-xs">
          <div className="space-y-1">
            <p className="font-semibold">Employee dashboard parity</p>
            <p>In sync: <strong>{inSync}</strong></p>
            <p>Different value: <strong>{parity.drift_value}</strong></p>
            <p>Different supporting files: <strong>{parity.drift_evidence}</strong></p>
            <p>Not yet propagated: <strong>{pending}</strong></p>
            <p className="text-muted-foreground pt-1 border-t">Click "Manage files" to re-sync.</p>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}