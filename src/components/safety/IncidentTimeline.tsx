import { Loader2 } from 'lucide-react';
import { useIncidentTimeline } from '@/hooks/useSafetyIncidentDetail';
import { SAFETY_STATUS_LABELS } from '@/lib/safetyIncidents';
import { format } from 'date-fns';
import { groupTimelineByDay, isGroupCollapsedByDefault } from '@/lib/incidentTimelineGrouping';
import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

export function IncidentTimeline({
  incidentId,
  grouped = false,
}: {
  incidentId: string;
  /**
   * When true, render rows bucketed by local calendar day with stage chips
   * and collapsible groups older than 7 days. Default (false) preserves the
   * legacy flat ordered list — additive, fully backward-compatible.
   */
  grouped?: boolean;
}) {
  const { data: rows = [], isLoading } = useIncidentTimeline(incidentId);
  if (isLoading) {
    return <div className="flex justify-center py-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  }
  if (rows.length === 0) {
    return <p className="text-sm text-muted-foreground">No status changes yet.</p>;
  }
  if (grouped) {
    return <GroupedTimeline rows={rows} />;
  }
  return (
    <ol className="relative border-l border-border ml-3 space-y-4">
      {rows.map((r) => (
        <li key={r.id} className="ml-4">
          <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
          <p className="text-sm font-medium">
            {r.from_status ? `${SAFETY_STATUS_LABELS[r.from_status]} → ` : ''}
            {SAFETY_STATUS_LABELS[r.to_status]}
          </p>
          <p className="text-xs text-muted-foreground">
            {format(new Date(r.created_at), 'dd MMM yyyy, HH:mm')}
          </p>
          {r.notes && <p className="text-sm text-muted-foreground mt-1">{r.notes}</p>}
        </li>
      ))}
    </ol>
  );
}

function GroupedTimeline({ rows }: { rows: ReturnType<typeof useIncidentTimeline>['data'] extends infer T ? Exclude<T, undefined> : never }) {
  const groups = groupTimelineByDay(rows);
  return (
    <div className="space-y-4">
      {groups.map((g) => (
        <DayGroup key={g.dayKey} group={g} />
      ))}
    </div>
  );
}

function DayGroup({ group }: { group: ReturnType<typeof groupTimelineByDay>[number] }) {
  const [open, setOpen] = useState(!isGroupCollapsedByDefault(group));
  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className="w-full flex items-center gap-2 px-3 py-2 text-left hover:bg-muted/50"
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        <span className="text-sm font-medium">{format(group.date, 'EEE, dd MMM yyyy')}</span>
        <span className="ml-auto text-xs text-muted-foreground">
          {group.rows.length} event{group.rows.length === 1 ? '' : 's'}
        </span>
      </button>
      {open && (
        <ol className="relative border-l border-border ml-6 my-3 mr-3 space-y-3">
          {group.rows.map((r) => (
            <li key={r.id} className="ml-4">
              <div className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-primary" />
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center rounded-full bg-primary/10 text-primary text-xs px-2 py-0.5 font-medium">
                  {SAFETY_STATUS_LABELS[r.to_status]}
                </span>
                {r.from_status && (
                  <span className="text-xs text-muted-foreground">
                    from {SAFETY_STATUS_LABELS[r.from_status]}
                  </span>
                )}
                <span className="ml-auto text-xs text-muted-foreground">
                  {format(new Date(r.created_at), 'HH:mm')}
                </span>
              </div>
              {r.notes && <p className="text-sm text-muted-foreground mt-1">{r.notes}</p>}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}