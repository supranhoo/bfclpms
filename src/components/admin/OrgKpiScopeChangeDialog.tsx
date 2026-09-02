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
import { Loader2, AlertTriangle, CheckCircle2, Lock, CircleSlash } from 'lucide-react';
import { groupSkips, skipSummaryText } from '@/lib/orgKpi/scopeCascadeSkips';
import {
  useChangeOrgKpiScope,
  useScopeCascadePreview,
  type ScopeCascadeMode,
} from '@/hooks/useOrgKpiManagement';
import { ScopeTargetPicker } from '@/components/admin/kpi-scope/ScopeTargetPicker';
import { scopeNeedsTarget, kpiScopeLabel, type AnyKpiScope } from '@/lib/review/kpiScope';

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
  // ADR-320 — grouped scopes (business unit, location, …) are selectable too.
  newScope: AnyKpiScope;
  /**
   * Optional: KPI frequency (e.g. 'Bi-Monthly', 'Quarterly'). When provided and
   * multi-month, the dialog surfaces a cycle-anchor warning so admins know the
   * change applies to the cycle's terminal month, not the current calendar month.
   */
  frequency?: string | null;
}

export function OrgKpiScopeChangeDialog({
  open,
  onClose,
  identifier,
  currentScope,
  newScope,
  frequency,
}: Props) {
  const [cascadeForward, setCascadeForward] = useState(false);
  // ADR-344 — opt in to creating the KPI in months of the span that lack it.
  const [seedMissing, setSeedMissing] = useState(false);
  // ADR-320 — a grouped scope must name the one target it moves to.
  const [newTarget, setNewTarget] = useState<string | null>(null);
  const needsTarget = scopeNeedsTarget(newScope) && newScope !== 'department' && newScope !== 'employee';
  const previewMutation = useScopeCascadePreview();
  const applyMutation = useChangeOrgKpiScope();

  // Re-run dry-run whenever the cascade option toggles
  useEffect(() => {
    if (!open) return;
    if (needsTarget && !newTarget) return;
    previewMutation.mutate({ identifier, newScope, newTarget, cascadeForward, seedMissing });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cascadeForward, newTarget, seedMissing]);

  const preview = previewMutation.data;
  const skips = groupSkips(preview?.skipped);

  const handleApply = () => {
    const mode: ScopeCascadeMode = cascadeForward ? 'current_and_future' : 'current_only';
    applyMutation.mutate(
      { identifier, newScope, newTarget, cascadeMode: mode, seedMissing },
      { onSuccess: () => onClose() }
    );
  };


  const isAggregating =
    (currentScope === 'employee' && newScope !== 'employee') ||
    (currentScope === 'department' && newScope === 'organization');
  const isSplitting =
    (currentScope === 'organization' && newScope !== 'organization') ||
    (currentScope === 'department' && newScope === 'employee');

  const isMultiMonth = !!frequency && ['Bi-Monthly','Quarterly','Half-Yearly','Yearly'].includes(frequency);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Change Org KPI Scope</DialogTitle>
          <DialogDescription className="space-y-1">
            <span className="block font-medium text-foreground">{identifier.kraName} → {identifier.kpiName}</span>
            <span className="block">
              From <Badge variant="outline" className="mx-1">{currentScope}</Badge>
              to <Badge className="mx-1">{kpiScopeLabel(newScope)}</Badge>
            </span>
          </DialogDescription>
        </DialogHeader>

        {isMultiMonth && (
          <div className="flex gap-2 rounded-md border border-warning/40 bg-warning/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning" />
            <div className="space-y-1">
              <p>
                <strong>{frequency} cycle:</strong> the change targets the cycle's <em>terminal month</em>,
                not the displayed calendar month. OKV migration uses the terminal month as the cycle anchor.
                Forward-cascade visits each future cycle exactly once.
              </p>
            </div>
          </div>
        )}

        {/* Aggregation/Split warning */}
        {(isAggregating || isSplitting) && (
          <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-destructive" />
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

        {/* ADR-320 — grouped scopes ask which one before anything is previewed. */}
        {needsTarget && (
          <ScopeTargetPicker
            scope={newScope}
            value={newTarget}
            onChange={setNewTarget}
          />
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

        {/* ADR-344 — months with no row for this KPI can be created on request. */}
        {(skips.missing.length > 0 || seedMissing) && (
          <div className="flex items-start gap-3 rounded-md border p-3">
            <Checkbox
              id="seed-missing"
              checked={seedMissing}
              onCheckedChange={(v) => setSeedMissing(v === true)}
            />
            <div className="space-y-1">
              <label htmlFor="seed-missing" className="text-sm font-medium cursor-pointer">
                Also create this KPI in the remaining months that don't have it
              </label>
              <p className="text-xs text-muted-foreground">
                Copies the current month's definition (type, ladder, weightage, frequency and the
                same employees) into those months with the new scope already applied. Locked
                periods are never created.
              </p>
            </div>
          </div>
        )}


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
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span className="font-medium">{p.period} {p.year}</span>
                    {p.seeded && (
                      <Badge variant="outline" className="text-[11px]">will be created</Badge>
                    )}
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
                    {s.reason === 'period_locked' ? (
                      <Lock className="h-4 w-4" />
                    ) : (
                      <CircleSlash className="h-4 w-4" />
                    )}
                    <span>{s.period} {s.year}</span>
                  </div>
                  <Badge variant="secondary" className="text-[11px]">
                    {s.reason === 'period_locked'
                      ? 'Period locked'
                      : s.reason === 'no_org_kpi_rows'
                        ? 'No rows for this KPI yet'
                        : s.reason}
                  </Badge>
                </div>
              ))}
              {skipSummaryText(preview.skipped) && (
                <div className="px-3 py-2 text-xs text-muted-foreground">
                  {skipSummaryText(preview.skipped)}
                </div>
              )}

            </div>
          ) : needsTarget && !newTarget ? (
            <div className="p-4 text-sm text-muted-foreground">
              Choose a {kpiScopeLabel(newScope).toLowerCase()} above to see which periods change.
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
            disabled={
              applyMutation.isPending ||
              !preview ||
              preview.periods.length === 0 ||
              (needsTarget && !newTarget)
            }
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