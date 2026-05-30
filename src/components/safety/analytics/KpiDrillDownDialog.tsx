/**
 * Phase 10 — Safety Analytics v2: KPI drill-down dialog
 * -----------------------------------------------------
 * Click a KPI tile, get the matching incidents listed. Pure read on
 * the already-cached `useSafetyIncidents()` query — no new fetch.
 */
import { Link } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ExternalLink, Loader2 } from 'lucide-react';
import { useSafetyIncidents, type SafetyIncidentRow } from '@/hooks/useSafetyIncidents';

export type DrillKey = 'open' | 'closed' | 'critical';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  kind: DrillKey | null;
}

const TITLES: Record<DrillKey, { title: string; description: string }> = {
  open:     { title: 'Open Incidents',      description: 'Incidents not yet closed.' },
  closed:   { title: 'Closed Incidents',    description: 'Incidents in the closed stage.' },
  critical: { title: 'Critical Severity',   description: 'Incidents flagged as critical severity (12-month window).' },
};

function matches(row: SafetyIncidentRow, kind: DrillKey): boolean {
  if (kind === 'open')     return row.status !== 'closed' && row.status !== 'orphaned';
  if (kind === 'closed')   return row.status === 'closed';
  return row.severity === 'critical';
}

export function KpiDrillDownDialog({ open, onOpenChange, kind }: Props) {
  const { data, isLoading } = useSafetyIncidents();
  const filtered = kind && data ? data.filter((r) => matches(r, kind)) : [];
  const meta = kind ? TITLES[kind] : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{meta?.title ?? 'Incidents'}</DialogTitle>
          <DialogDescription>{meta?.description}</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="py-10 flex items-center justify-center text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin mr-2" /> Loading incidents…
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            No matching incidents.
          </p>
        ) : (
          <ScrollArea className="max-h-[60vh] pr-3">
            <ul className="space-y-2">
              {filtered.slice(0, 100).map((row) => (
                <li key={row.id} className="rounded-md border p-3 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono text-xs text-muted-foreground">
                        {row.incident_number ?? row.id.slice(0, 8)}
                      </span>
                      <Badge
                        variant={row.severity === 'critical' || row.severity === 'high'
                          ? 'destructive' : 'secondary'}
                      >
                        {row.severity}
                      </Badge>
                      <Badge variant="outline">{row.status.replace(/_/g, ' ')}</Badge>
                    </div>
                    <div className="text-sm font-medium truncate mt-1">{row.title}</div>
                    <div className="text-xs text-muted-foreground truncate">{row.location}</div>
                  </div>
                  <Link
                    to={`/safety/incidents/${row.id}`}
                    onClick={() => onOpenChange(false)}
                    className="text-primary hover:underline text-xs flex items-center gap-1 shrink-0 pt-1"
                  >
                    Open <ExternalLink className="h-3 w-3" />
                  </Link>
                </li>
              ))}
            </ul>
            {filtered.length > 100 && (
              <p className="text-xs text-muted-foreground text-center pt-3">
                Showing first 100 of {filtered.length}.
              </p>
            )}
          </ScrollArea>
        )}
      </DialogContent>
    </Dialog>
  );
}