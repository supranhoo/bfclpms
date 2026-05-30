import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Search, Wrench, ShieldCheck } from 'lucide-react';
import type { SafetyIncidentRow } from '@/hooks/useSafetyIncidents';

/**
 * Structured read-only visualization of RCA / CAPA / Verification text
 * captured during the existing workflow. Writes still flow through
 * StageActionPanel + transition_safety_incident RPC — this component
 * is presentation-only (Governance Phase 3: UI-only, contract-preserving).
 */
export function IncidentRcaPanel({ incident }: { incident: SafetyIncidentRow }) {
  const hasAny = !!(incident.rca_summary || incident.capa_summary || incident.verification_notes);
  if (!hasAny) {
    return (
      <Card>
        <CardHeader><CardTitle className="text-base">Investigation Summary</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            No root cause, corrective action, or verification notes recorded yet.
            These are captured by the responsible reviewer at the matching workflow stage.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Investigation Summary</CardTitle>
      </CardHeader>
      <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <Section
          icon={<Search className="h-4 w-4" />}
          title="Root Cause"
          body={incident.rca_summary}
        />
        <Section
          icon={<Wrench className="h-4 w-4" />}
          title="Corrective & Preventive Action"
          body={incident.capa_summary}
        />
        <Section
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Verification"
          body={incident.verification_notes}
          className="md:col-span-2"
        />
      </CardContent>
    </Card>
  );
}

function Section({
  icon,
  title,
  body,
  className,
}: {
  icon: React.ReactNode;
  title: string;
  body: string | null;
  className?: string;
}) {
  return (
    <div className={`rounded-md border bg-muted/30 p-3 ${className ?? ''}`}>
      <div className="flex items-center gap-2 text-sm font-medium mb-1.5">
        <span className="text-primary">{icon}</span>
        {title}
      </div>
      {body ? (
        <p className="text-sm whitespace-pre-wrap text-foreground/90">{body}</p>
      ) : (
        <p className="text-xs text-muted-foreground italic">Pending</p>
      )}
    </div>
  );
}