import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle } from 'lucide-react';
import {
  useMarkIncidentDuplicate,
  useSafetyIncidentsForDuplicatePicker,
  type SafetyIncidentRow,
} from '@/hooks/useSafetyIncidents';
import { format } from 'date-fns';

/**
 * Phase 2 — BU Head action to mark an incident as a duplicate of another
 * open incident in the same business unit. Server-side RPC enforces the
 * BU-Head permission scope; this UI only filters visible candidates.
 */
export function MarkDuplicateDialog({
  open,
  onOpenChange,
  incident,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  incident: SafetyIncidentRow;
}) {
  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [remarks, setRemarks] = useState('');

  const { data: candidates = [], isLoading } = useSafetyIncidentsForDuplicatePicker({
    businessUnitId: incident.business_unit_id,
    excludeIncidentId: incident.id,
    search,
    enabled: open,
  });

  const mark = useMarkIncidentDuplicate();
  const canSubmit = !!selectedId && remarks.trim().length > 0 && !mark.isPending;

  function reset() {
    setSearch('');
    setSelectedId(null);
    setRemarks('');
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-500" />
            Mark incident as duplicate
          </DialogTitle>
          <DialogDescription>
            Link this incident to an existing open incident in the same business unit.
            The Safety Head will review and close it. The SLA clock keeps ticking
            until closure.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-xs">
            <div className="font-mono">{incident.incident_number}</div>
            <div className="text-foreground">{incident.title}</div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dup-search">Master incident (same business unit, open)</Label>
            <Input
              id="dup-search"
              placeholder="Search by incident number or title"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
              {isLoading && (
                <div className="p-3 text-xs text-muted-foreground flex items-center gap-2">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" /> Searching…
                </div>
              )}
              {!isLoading && candidates.length === 0 && (
                <div className="p-3 text-xs text-muted-foreground">
                  No matching open incidents in this business unit.
                </div>
              )}
              {candidates.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedId(c.id)}
                  className={`w-full text-left p-2.5 text-xs hover:bg-accent ${
                    selectedId === c.id ? 'bg-accent' : ''
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono">{c.incident_number}</span>
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {c.status}
                    </Badge>
                  </div>
                  <div className="text-foreground line-clamp-1 mt-0.5">{c.title}</div>
                  <div className="text-muted-foreground mt-0.5">
                    {format(new Date(c.occurred_at), 'dd MMM yyyy, HH:mm')}
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dup-remarks">Remarks (required)</Label>
            <Textarea
              id="dup-remarks"
              rows={3}
              placeholder="Briefly explain why this is a duplicate (e.g. same event, same shift, reported twice)…"
              value={remarks}
              onChange={(e) => setRemarks(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={mark.isPending}>
            Cancel
          </Button>
          <Button
            onClick={() =>
              mark.mutate(
                {
                  incidentId: incident.id,
                  masterIncidentId: selectedId!,
                  remarks: remarks.trim(),
                },
                {
                  onSuccess: () => {
                    reset();
                    onOpenChange(false);
                  },
                },
              )
            }
            disabled={!canSubmit}
          >
            {mark.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Mark as duplicate'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}