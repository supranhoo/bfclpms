import { Badge } from '@/components/ui/badge';
import { Lightbulb } from 'lucide-react';
import { SAFETY_STATUS_LABELS, type SafetyIncidentStatus } from '@/lib/safetyIncidents';
import { useSafetySettings } from '@/hooks/useSafetySettings';

/**
 * Stage-aware header for the v2 incident detail layout.
 * Reads admin-tunable copy from `safety_settings.incident_stage_copy`.
 * Falls back to the canonical label + a generic hint when copy is missing.
 *
 * Display-only — never mutates incident state.
 */
export function IncidentStageHeader({ status }: { status: SafetyIncidentStatus }) {
  const { data: rows = [] } = useSafetySettings();
  const copyRow = rows.find((r) => r.key === 'incident_stage_copy');
  const copyMap = (copyRow?.value ?? {}) as Record<
    string,
    { title?: string; hint?: string } | undefined
  >;
  const entry = copyMap[status];
  const title = entry?.title ?? SAFETY_STATUS_LABELS[status];
  const hint = entry?.hint;

  return (
    <div className="rounded-md border border-primary/20 bg-primary/5 p-3 space-y-1">
      <div className="flex items-center gap-2 flex-wrap">
        <Badge variant="outline" className="border-primary/40 text-primary">
          Current stage
        </Badge>
        <span className="text-sm font-semibold text-foreground">{title}</span>
      </div>
      {hint && (
        <p className="text-xs text-muted-foreground flex items-start gap-1.5">
          <Lightbulb className="h-3.5 w-3.5 mt-0.5 shrink-0" />
          <span>{hint}</span>
        </p>
      )}
    </div>
  );
}