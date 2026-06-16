import { useMemo } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Info, RotateCcw } from 'lucide-react';
import {
  STAGE_WEIGHT_KEYS,
  isValidStageWeights,
  LEGACY_STAGE_WEIGHTS,
  type StageWeights,
  type StageWeightKey,
} from '@/lib/annualReview/finalScore';

const LABELS: Record<StageWeightKey, string> = {
  self: 'Self review',
  manager: 'Manager (R1)',
  skip_manager: 'Skip manager',
  bu_head: 'BU head',
  hr: 'HR finalization',
  system: 'System score',
  criteria: 'Criteria score (legacy)',
};

const HINTS: Record<StageWeightKey, string> = {
  self: 'Weight given to the employee\u2019s self review.',
  manager: 'Weight given to the direct manager (R1) review.',
  skip_manager: 'Weight given to the skip-level manager review.',
  bu_head: 'Weight given to the Business Unit head review.',
  hr: 'Weight given to HR finalization.',
  system: 'Weight given to the aggregated system score panel.',
  criteria: 'Legacy bucket. Keep at 0 once stage weights are configured.',
};

/**
 * Editor for the configurable final-score weight blend (Phase 2).
 * Used inside the template editor (template-level default) and inside
 * the per-instance override dialog. Pure: parent owns state.
 */
export function StageWeightsEditor({
  value,
  onChange,
  helperText,
}: {
  value: StageWeights | null | undefined;
  onChange: (next: StageWeights) => void;
  helperText?: string;
}) {
  const current = useMemo<StageWeights>(() => ({ ...(value ?? {}) }), [value]);
  const total = useMemo(
    () => STAGE_WEIGHT_KEYS.reduce((acc, k) => acc + (Number(current[k]) || 0), 0),
    [current],
  );
  const totalRounded = Math.round(total * 100) / 100;
  const valid = isValidStageWeights(current);

  const setKey = (k: StageWeightKey, raw: string) => {
    const next: StageWeights = { ...current };
    if (raw.trim() === '') { delete next[k]; }
    else {
      const n = Number(raw);
      if (Number.isNaN(n)) return;
      next[k] = n;
    }
    onChange(next);
  };

  const applyLegacy = () => onChange({ ...LEGACY_STAGE_WEIGHTS });
  const applyClassic20_50_30 = () =>
    onChange({ self: 20, manager: 50, bu_head: 30 });

  return (
    <div className="space-y-3">
      {helperText && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-xs">{helperText}</AlertDescription>
        </Alert>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {STAGE_WEIGHT_KEYS.map((k) => (
          <div key={k} className="grid gap-1">
            <Label htmlFor={`sw-${k}`} className="text-xs flex items-center gap-1">
              {LABELS[k]}
              <span className="text-muted-foreground font-normal">(%)</span>
            </Label>
            <Input
              id={`sw-${k}`}
              type="number" inputMode="decimal" min={0} max={100} step={0.1}
              value={current[k] ?? ''}
              onChange={(e) => setKey(k, e.target.value)}
              placeholder="0"
              className="h-9"
            />
            <p className="text-[10px] text-muted-foreground leading-tight">{HINTS[k]}</p>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
        <span className="text-muted-foreground">Total</span>
        <div className="flex items-center gap-2">
          <span className="font-semibold tabular-nums">{totalRounded}%</span>
          {valid ? (
            <Badge variant="secondary">Valid</Badge>
          ) : (
            <Badge variant="destructive">Must equal 100%</Badge>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="outline" size="sm" onClick={applyClassic20_50_30}>
          Use 20 / 50 / 30 (Self / Manager / BU)
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={applyLegacy}>
          <RotateCcw className="h-3.5 w-3.5 mr-1" /> Reset to legacy (Criteria 100%)
        </Button>
      </div>
    </div>
  );
}