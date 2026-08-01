import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import type { BellCurveConfig } from '@/lib/annualReview/bellCurve';
import {
  DEFAULT_RATING_SLABS,
  applyExemptionPenalty,
  formatSlabPercent,
} from '@/lib/annualReview/ratingSlab';
import { useAnnualReviewRatingSlabs } from '@/hooks/useAnnualReviewRatingSlabs';
import { useSaveBellCurveConfig } from '@/hooks/useBellCurveConfig';

/**
 * ADR-222a — the exemption penalty rule lives in its own dialog, separate from
 * bell curve target distribution. Invariant: this dialog saves the FULL config
 * copy so it never blanks the target/threshold fields owned by the other dialog.
 */
export function ExemptionPenaltyDialog({
  open, onOpenChange, config, cycleId, cycleName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  config: BellCurveConfig;
  cycleId?: string;
  cycleName?: string;
}) {
  const [draft, setDraft] = useState<BellCurveConfig>(config);
  const [scopeCycle, setScopeCycle] = useState(false);
  const save = useSaveBellCurveConfig();
  const { data: slabs = [] } = useAnnualReviewRatingSlabs();

  useEffect(() => {
    if (open) {
      setDraft(config);
      setScopeCycle(Boolean(config.cycle_id));
    }
  }, [open, config]);

  const set = (key: keyof BellCurveConfig, value: string) =>
    setDraft((d) => ({ ...d, [key]: value === '' ? 0 : Number(value) }));

  const activeSlabs = slabs.length > 0 ? slabs : DEFAULT_RATING_SLABS;
  const penaltyRule = {
    mode: draft.exempted_penalty_mode ?? 'top_tiers_excluded',
    stepDownSlabs: draft.exempted_step_down_slabs ?? 1,
    topTiersExcluded: draft.exempted_top_tiers_excluded ?? 0,
    scope: draft.exempted_penalty_scope ?? 'all_slabs',
    topSlabs: draft.exempted_penalty_top_slabs ?? 2,
    floorPercent: draft.exempted_penalty_floor_percent ?? 0,
  } as const;
  const previewRows = [...activeSlabs]
    .filter((s) => s.is_active !== false)
    .sort((a, b) => b.rating_from - a.rating_from)
    .map((s) => {
      const from = Number(s.increment_percent);
      const res = applyExemptionPenalty(from, activeSlabs, penaltyRule);
      return { from, to: res.percent ?? from, applied: res.applied };
    });

  const onSave = async () => {
    const scopingChanged = scopeCycle !== Boolean(config.cycle_id);
    const payload: BellCurveConfig = {
      ...draft,
      id: scopingChanged ? undefined : draft.id,
      cycle_id: scopeCycle ? (cycleId ?? null) : null,
    };
    try {
      await save.mutateAsync(payload);
      toast.success('Exemption penalty rule saved');
      onOpenChange(false);
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exemption penalty rule</DialogTitle>
          <DialogDescription>
            Employees made eligible through an approved exemption take a reduced increment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <Label className="text-sm">Apply a penalty</Label>
              <p className="text-xs text-muted-foreground">
                Turn off to give exempted employees their full slab increment.
              </p>
            </div>
            <Switch
              checked={draft.exempted_slab_cap_enabled !== false}
              onCheckedChange={(v) => setDraft((d) => ({ ...d, exempted_slab_cap_enabled: v }))}
            />
          </div>

          {draft.exempted_slab_cap_enabled !== false && (
            <div className="space-y-3 border-t pt-3">
              <div className="flex items-center gap-3">
                <Label className="flex-1 text-sm">Penalty type</Label>
                <Select
                  value={draft.exempted_penalty_mode ?? 'top_tiers_excluded'}
                  onValueChange={(v) => setDraft((d) => ({
                    ...d, exempted_penalty_mode: v as BellCurveConfig['exempted_penalty_mode'],
                  }))}
                >
                  <SelectTrigger className="w-56 h-10"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-popover z-50">
                    <SelectItem value="none">No penalty</SelectItem>
                    <SelectItem value="step_down">Step down N slabs</SelectItem>
                    <SelectItem value="top_tiers_excluded">Exclude top N tiers</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {draft.exempted_penalty_mode === 'step_down' ? (
                <>
                  <div className="flex items-center gap-3">
                    <Label className="flex-1 text-sm">Slabs to step down</Label>
                    <Input
                      type="number" min={1} max={6}
                      className="w-28 h-10 text-right"
                      value={String(draft.exempted_step_down_slabs ?? 1)}
                      onChange={(e) => setDraft((d) => ({
                        ...d,
                        exempted_step_down_slabs: e.target.value === '' ? 1 : Math.trunc(Number(e.target.value)),
                      }))}
                    />
                  </div>
                  <div className="flex items-center gap-3">
                    <Label className="flex-1 text-sm">Applies to</Label>
                    <Select
                      value={draft.exempted_penalty_scope ?? 'all_slabs'}
                      onValueChange={(v) => setDraft((d) => ({
                        ...d, exempted_penalty_scope: v as BellCurveConfig['exempted_penalty_scope'],
                      }))}
                    >
                      <SelectTrigger className="w-56 h-10"><SelectValue /></SelectTrigger>
                      <SelectContent className="bg-popover z-50">
                        <SelectItem value="all_slabs">Every slab</SelectItem>
                        <SelectItem value="top_slabs_only">Top slabs only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {draft.exempted_penalty_scope === 'top_slabs_only' && (
                    <div className="flex items-center gap-3">
                      <Label className="flex-1 text-sm">How many slabs count as “top”</Label>
                      <Input
                        type="number" min={1} max={6}
                        className="w-28 h-10 text-right"
                        value={String(draft.exempted_penalty_top_slabs ?? 2)}
                        onChange={(e) => setDraft((d) => ({
                          ...d,
                          exempted_penalty_top_slabs: e.target.value === '' ? 1 : Math.trunc(Number(e.target.value)),
                        }))}
                      />
                    </div>
                  )}
                </>
              ) : draft.exempted_penalty_mode !== 'none' ? (
                <div className="flex items-center gap-3">
                  <Label className="flex-1 text-sm">Top tiers excluded</Label>
                  <Input
                    type="number" min={0} max={6}
                    className="w-28 h-10 text-right"
                    value={String(draft.exempted_top_tiers_excluded ?? 2)}
                    onChange={(e) => setDraft((d) => ({
                      ...d,
                      exempted_top_tiers_excluded: e.target.value === '' ? 0 : Math.trunc(Number(e.target.value)),
                    }))}
                  />
                </div>
              ) : null}

              {draft.exempted_penalty_mode !== 'none' && (
                <>
                  <div className="flex items-center gap-3">
                    <Label className="flex-1 text-sm">Floor (never below)</Label>
                    <Input
                      type="number" min={0} max={100}
                      className="w-28 h-10 text-right"
                      value={String(draft.exempted_penalty_floor_percent ?? 0)}
                      onChange={(e) => set('exempted_penalty_floor_percent', e.target.value)}
                    />
                    <span className="w-4 text-sm text-muted-foreground">%</span>
                  </div>
                  <div className="rounded-md border p-2">
                    <p className="text-xs font-medium mb-1">Effect on each slab</p>
                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                      {previewRows.map((r) => (
                        <div key={r.from} className={r.applied ? '' : 'text-muted-foreground'}>
                          {formatSlabPercent(r.from)} → {formatSlabPercent(r.to)}
                        </div>
                      ))}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {cycleId && (
            <label className="flex items-center gap-2 text-sm border-t pt-3">
              <input
                type="checkbox"
                className="h-4 w-4"
                checked={scopeCycle}
                onChange={(e) => setScopeCycle(e.target.checked)}
              />
              Apply only to “{cycleName ?? 'this cycle'}” (otherwise saved as the organisation default)
            </label>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={save.isPending}>
            {save.isPending ? 'Saving…' : 'Save rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
