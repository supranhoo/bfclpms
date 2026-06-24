import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info } from 'lucide-react';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  CRITERIA_MIX_ROLES,
  flattenStageWeightsV2,
  isValidStageWeightsV2,
  type CriteriaMixRole,
  type StageWeights,
  type StageWeightsV2,
} from '@/lib/annualReview/finalScore';
import { StageWeightsEditor } from './StageWeightsEditor';

const ROLE_LABELS: Record<CriteriaMixRole, string> = {
  self: 'Self review',
  manager: 'Manager (R1)',
  skip_manager: 'Skip manager',
  dept_head: 'Department head',
  bu_head: 'BU head',
  hr: 'HR finalization',
};

/**
 * Two-tier final-score weight editor (Phase 3).
 *
 * Top-level: System pool vs Criteria pool (must sum to 100).
 * Inner:     reviewer mix inside the Criteria pool (must sum to 100).
 *
 * Dual-writes both the v2 config (source of truth for the admin) and the
 * derived flat `StageWeights` snapshot (consumed by the math engine + SQL).
 * An "Advanced" disclosure preserves the legacy flat editor for templates
 * that need ad-hoc blends.
 */
export function StageWeightsBlendEditor({
  v2,
  flat,
  onChange,
}: {
  v2: StageWeightsV2 | null | undefined;
  flat: StageWeights | null | undefined;
  /** Receives both sides — caller is responsible for persisting both fields. */
  onChange: (next: { v2: StageWeightsV2 | null; flat: StageWeights | null }) => void;
}) {
  const current: StageWeightsV2 = useMemo(() => ({
    pools: { system: v2?.pools?.system, criteria: v2?.pools?.criteria },
    criteria_mix: { ...(v2?.criteria_mix ?? {}) },
  }), [v2]);

  const poolTotal = (Number(current.pools.system) || 0) + (Number(current.pools.criteria) || 0);
  const mixTotal = CRITERIA_MIX_ROLES.reduce(
    (acc, r) => acc + (Number(current.criteria_mix[r]) || 0), 0,
  );
  const valid = isValidStageWeightsV2(current);
  const derived = valid ? flattenStageWeightsV2(current) : null;
  const excludeSelf = (Number(current.criteria_mix.self) || 0) === 0;

  const emitV2 = (next: StageWeightsV2) => {
    const derivedNext = isValidStageWeightsV2(next) ? flattenStageWeightsV2(next) : null;
    onChange({ v2: next, flat: derivedNext });
  };

  const setPool = (k: 'system' | 'criteria', raw: string) => {
    const next: StageWeightsV2 = { ...current, pools: { ...current.pools } };
    if (raw.trim() === '') delete (next.pools as Record<string, number | undefined>)[k];
    else {
      const n = Number(raw);
      if (Number.isNaN(n)) return;
      next.pools[k] = n;
    }
    emitV2(next);
  };

  const setMix = (r: CriteriaMixRole, raw: string) => {
    const next: StageWeightsV2 = {
      ...current,
      criteria_mix: { ...current.criteria_mix },
    };
    if (raw.trim() === '') delete next.criteria_mix[r];
    else {
      const n = Number(raw);
      if (Number.isNaN(n)) return;
      next.criteria_mix[r] = n;
    }
    emitV2(next);
  };

  const toggleExcludeSelf = (on: boolean) => {
    const next: StageWeightsV2 = {
      ...current,
      criteria_mix: { ...current.criteria_mix },
    };
    if (on) next.criteria_mix.self = 0;
    else delete next.criteria_mix.self;
    emitV2(next);
  };

  const applyPreset_60_40_dept70_bu30 = () => emitV2({
    pools: { system: 60, criteria: 40 },
    criteria_mix: { self: 0, dept_head: 70, bu_head: 30 },
  });

  const applyPreset_50_50_self20_mgr50_bu30 = () => emitV2({
    pools: { system: 50, criteria: 50 },
    criteria_mix: { self: 20, manager: 50, bu_head: 30 },
  });

  const clearV2 = () => onChange({ v2: null, flat: flat ?? null });

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription className="text-xs">
          Configure final-score weighting in two tiers: first split between the
          <strong> System Score</strong> and the <strong>Criteria</strong> (reviewer) pool,
          then distribute the Criteria pool across reviewers. Both groups must total 100%.
        </AlertDescription>
      </Alert>

      {/* Section A — pools */}
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between">
          <div className="text-sm font-semibold">A. Outer pools</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{Math.round(poolTotal * 100) / 100}%</span>
            {Math.abs(poolTotal - 100) < 0.01
              ? <Badge variant="secondary">Valid</Badge>
              : <Badge variant="destructive">Must equal 100%</Badge>}
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="grid gap-1">
            <Label className="text-xs">System Score (%)</Label>
            <Input
              type="number" inputMode="decimal" min={0} max={100} step={0.1}
              value={current.pools.system ?? ''}
              onChange={(e) => setPool('system', e.target.value)}
              placeholder="0" className="h-9"
            />
            <p className="text-[10px] text-muted-foreground leading-tight">
              Weight of the aggregated System Score panel.
            </p>
          </div>
          <div className="grid gap-1">
            <Label className="text-xs">Criteria Score (%)</Label>
            <Input
              type="number" inputMode="decimal" min={0} max={100} step={0.1}
              value={current.pools.criteria ?? ''}
              onChange={(e) => setPool('criteria', e.target.value)}
              placeholder="0" className="h-9"
            />
            <p className="text-[10px] text-muted-foreground leading-tight">
              Pool distributed across reviewers in Section B.
            </p>
          </div>
        </div>
      </div>

      {/* Section B — reviewer mix */}
      <div className="rounded-md border p-3 space-y-3">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div className="text-sm font-semibold">B. Criteria reviewer mix (% of the Criteria pool)</div>
          <div className="flex items-center gap-2 text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-semibold tabular-nums">{Math.round(mixTotal * 100) / 100}%</span>
            {Math.abs(mixTotal - 100) < 0.01
              ? <Badge variant="secondary">Valid</Badge>
              : <Badge variant="destructive">Must equal 100%</Badge>}
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs">
          <Switch id="exclude-self" checked={excludeSelf} onCheckedChange={toggleExcludeSelf} />
          <Label htmlFor="exclude-self" className="text-xs cursor-pointer">
            Exclude self-review from final score (pin Self to 0%)
          </Label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {CRITERIA_MIX_ROLES.map((r) => (
            <div key={r} className="grid gap-1">
              <Label className="text-xs">{ROLE_LABELS[r]} (%)</Label>
              <Input
                type="number" inputMode="decimal" min={0} max={100} step={0.1}
                value={current.criteria_mix[r] ?? ''}
                onChange={(e) => setMix(r, e.target.value)}
                placeholder="0" className="h-9"
                disabled={r === 'self' && excludeSelf}
              />
            </div>
          ))}
        </div>
      </div>

      {/* Derived preview */}
      <div className="rounded-md border bg-muted/40 p-3 space-y-1">
        <div className="text-xs font-semibold">Derived final-score blend</div>
        {derived ? (
          <div className="text-xs text-muted-foreground flex flex-wrap gap-x-3 gap-y-1">
            {Object.entries(derived).map(([k, v]) => (
              <span key={k}><strong>{k}</strong>: {v}%</span>
            ))}
          </div>
        ) : (
          <div className="text-xs text-destructive">
            Configuration is incomplete — both Section A and Section B must total 100% before the blend is applied.
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={applyPreset_60_40_dept70_bu30}>
          Preset: 60 / 40 · Self 0 / Dept 70 / BU 30
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={applyPreset_50_50_self20_mgr50_bu30}>
          Preset: 50 / 50 · Self 20 / Mgr 50 / BU 30
        </Button>
        {v2 && (
          <Button type="button" variant="ghost" size="sm" onClick={clearV2}>
            Clear v2 (use Advanced flat below)
          </Button>
        )}
      </div>

      {/* Advanced — flat editor escape hatch */}
      <Collapsible>
        <CollapsibleTrigger asChild>
          <Button type="button" variant="link" size="sm" className="px-0 h-auto">
            Advanced — edit flat stage weights directly
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <Alert>
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              Editing flat weights here will <strong>only</strong> be used when the two-tier
              configuration above is empty or invalid. Prefer the two-tier editor for clarity.
            </AlertDescription>
          </Alert>
          <div className="pt-3">
            <StageWeightsEditor
              value={flat ?? null}
              onChange={(next) => onChange({ v2: valid ? current : null, flat: next })}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}