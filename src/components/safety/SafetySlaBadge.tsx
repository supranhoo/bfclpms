/**
 * Phase 11 — Flag-gated SLA badge.
 * Read-only visual chip. Caller decides whether to mount it
 * (typically gated on `ui_safety_sla_v2`).
 */
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Clock, ShieldCheck, Lock } from 'lucide-react';
import {
  badgeToneFor,
  classifySla,
  formatSlaCountdown,
  type SlaIncidentLike,
} from '@/lib/safetySla';
import { useNowTick } from '@/hooks/useNowTick';

interface Props {
  incident: SlaIncidentLike;
  className?: string;
}

export function SafetySlaBadge({ incident, className }: Props) {
  // Phase 2 / Safety migration — live countdown (re-renders every 30s
  // while the tab is visible). Closed incidents render once and are static.
  const tick = useNowTick(incident.status === 'closed' ? 0 : 30_000);
  const c = classifySla(incident, tick);
  const label = formatSlaCountdown(c);
  const Icon =
    c.state === 'red'    ? AlertTriangle :
    c.state === 'amber'  ? Clock :
    c.state === 'closed' ? Lock :
    ShieldCheck;
  return (
    <Badge variant={badgeToneFor(c.state)} className={className} title={`SLA: ${c.state.toUpperCase()}`}>
      <Icon className="h-3 w-3 mr-1" /> {label}
    </Badge>
  );
}