import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import { Loader2, AlertTriangle, CheckCircle2, Lock } from 'lucide-react';
import {
  useChangeOrgKpiScope,
  useScopeCascadePreview,
  type ScopeCascadeMode,
} from '@/hooks/useOrgKpiManagement';

interface Props {
  open: boolean;
  onClose: () => void;
  identifier: {
    categoryId: string;
    kraName: string;
    kpiName: string;
    reviewPeriod: string;
    reviewYear: number;
  };
  currentScope: string;
  newScope: 'organization' | 'department' | 'employee';
}

export function OrgKpiScopeChangeDialog({
  open,
  onClose,
  identifier,
  currentScope,
  newScope,
}: Props) {
  const [cascadeForward, setCascadeForward] = useState(false);
  const previewMutation = useScopeCascadePreview();
  const applyMutation = useChangeOrgKpiScope();

  // Re-run dry-run whenever the cascade option toggles
  useEffect(() => {
    if (!open) return;
    previewMutation.mutate({ identifier, newScope, cascadeForward });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cascadeForward]);

  const preview = previewMutation.data;

  const handleApply = () => {
    const mode: ScopeCascadeMode = cascadeForward ? 'current_and_future' : 'current_only';
    applyMutation.mutate(
      { identifier, newScope, cascadeMode: mode },
      { onSuccess: () => onClose() }
    );
  };

  const isAggregating =
    (currentScope === 'employee' && newScope !== 'employee') ||
    (currentScope === 'department' && newScope === 'organization');
  const isSplitting =
    (currentScope === 'organization' && newScope !== 'organization') ||
    (currentScope === 'department' && newScope === 'employee');

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change Org KPI Scope</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block font-medium text-foreground">{identifier.kraName} → {identifier.kpiName}</span>
            <span className="block">
              From <Badge variant="outline" className="mx-1">{currentScope}</Badge>
              to <Badge className="mx-1">{newScope}</Badge>
            </span>
          </DialogDescription>
        </DialogHeader>

        {/* Aggregation/Split warning */}
        {(isAggregating || isSplitting) && (
          <div className="flex gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <div className="space-y-1">
              {isAggregating && (
                <p>
                  <strong>Aggregation:</strong> existing per-{currentScope} values will be averaged
                  into the new {newScope}-scope value(s). Source values are archived in
                  <code className="mx-1 text-[11px]">okv_migration_history</code>
                  for revert.
                </p>
              )}
              {isSplitting && (
                <p>
                  <strong>Split:</strong> the existing {currentScope}-scope value will seed
                  draft entries for each target {newScope}. Data Owners must reconfirm before propagation.
                </p>
              )}
            </div>
          </div>
        )}

        {/* Cascade option */}
        <div className="flex items-start gap-3 rounded-md border p-3">
          <Checkbox
            id="cascade"
            checked={cascadeForward}
            onCheckedChange={(v) => setCascadeForward(v === true)}
          />
          <div className="space-y-1">
            <label htmlFor="cascade" className="text-sm font-medium cursor-pointer">
              Apply to all open future periods (this fiscal year)
            </label>
            <p className="text-xs text-muted-foreground">
              Locked periods are skipped. Each period's OKV values are migrated independently.
            </p>
          </div>
        </div>

        {/* Preview */}
        <div className="rounded-md border">
          <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
            Preview
          </div>
          {previewMutation.isPending ? (
            <div className="flex items-center justify-center gap-2 p-6 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Resolving affected periods…
            </div>
          ) : preview ? (
            <div className="divide-y">
              {preview.periods.length === 0 && preview.skipped.length === 0 && (
                <div className="p-4 text-sm text-muted-foreground">No matching periods found.</div>
              )}
              {preview.periods.map((p) => (
                <div
                  key={`${p.period}-${p.year}`}
                  className="flex items-center justify-between px-3 py-2 text-sm"
                >
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    <span className="font-medium">{p.period} {p.year}</span>
                  </div>
                  <Badge variant="outline" className="text-[11px]">
                    {p.old_scope} → {p.new_scope}
                  </Badge>
                </div>
              ))}
              {preview.skipped.map((s) => (
                <div
                  key={`skip-${s.period}-${s.year}`}
                  className="flex items-center justify-between px-3 py-2 text-sm text-muted-foreground"
                >
                  <div className="flex items-center gap-2">
                    <Lock className="h-4 w-4" />
                    <span>{s.period} {s.year}</span>
                  </div>
                  <Badge variant="secondary" className="text-[11px]">{s.reason}</Badge>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-4 text-sm text-muted-foreground">Toggle the cascade option to refresh preview.</div>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={applyMutation.isPending}>
            Cancel
          </Button>
          <Button
            onClick={handleApply}
            disabled={applyMutation.isPending || !preview || preview.periods.length === 0}
          >
            {applyMutation.isPending ? (
              <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Applying…</>
            ) : (
              `Apply to ${preview?.periods.length ?? 0} period(s)`
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}