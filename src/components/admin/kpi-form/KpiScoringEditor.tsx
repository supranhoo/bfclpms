/**
 * ADR-272 / ADR-271 — Type-aware scoring editor shared by both KPI forms.
 * Value based -> R5..R0 + threshold mode. Yes/No -> polarity. Tiered -> builder.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TieredOptionsBuilder } from '@/components/admin/TieredOptionsBuilder';
import { isBinaryInverted } from '@/lib/qualitativeUom';
import {
  KpiScoringState, binaryOptionsFor, validateScoringState,
  KPI_DIRECTION_OPTIONS, directionConflictsWithLadder,
} from './kpiFormModel';

interface Props {
  value: KpiScoringState;
  onChange: (next: KpiScoringState) => void;
  /** ADR-274a — optional direction control (`kpis.criteria`). */
  criteria?: string;
  onCriteriaChange?: (next: string) => void;
}

const R_FIELDS = ['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const;

export function KpiScoringEditor({ value, onChange, criteria, onCriteriaChange }: Props) {
  const set = (patch: Partial<KpiScoringState>) => onChange({ ...value, ...patch });
  const error = validateScoringState(value);
  const showDirection = typeof onCriteriaChange === 'function';
  const ladderConflict = showDirection && directionConflictsWithLadder(criteria, value.r5, value.r1);

  if (value.uom_type === 'binary') {
    const inverted = isBinaryInverted(value.qualitative_options);
    return (
      <div className="flex items-center justify-between gap-3 p-3 border rounded-md bg-muted/30">
        <div className="space-y-0.5">
          <Label className="text-xs font-medium">Binary Polarity</Label>
          <p className="text-xs text-muted-foreground">Safety KPIs: "No" should score highest</p>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={inverted ? 'inverted' : 'standard'}
            onValueChange={(val) => set({ qualitative_options: binaryOptionsFor(val === 'inverted') })}
          >
            <SelectTrigger className="h-8 w-[160px] text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="standard">Standard (Yes=5)</SelectItem>
              <SelectItem value="inverted">Inverted (No=5)</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex gap-2 text-xs font-medium">
            {inverted ? (
              <>
                <span className="text-destructive">Yes=R0</span>
                <span className="text-primary">No=R5</span>
              </>
            ) : (
              <>
                <span className="text-primary">Yes=R5</span>
                <span className="text-destructive">No=R0</span>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (value.uom_type === 'tiered') {
    return (
      <div className="space-y-1.5">
        <TieredOptionsBuilder
          options={value.qualitative_options}
          onChange={(options) => set({ qualitative_options: options })}
        />
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-3">
        {showDirection && (
          <>
            <Label className="text-xs whitespace-nowrap">Direction</Label>
            <Select value={criteria || undefined} onValueChange={(v) => onCriteriaChange!(v)}>
              <SelectTrigger className="h-8 w-[190px] text-xs">
                <SelectValue placeholder="Select direction" />
              </SelectTrigger>
              <SelectContent>
                {KPI_DIRECTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </>
        )}
        <span className="text-xs text-muted-foreground">
          Thresholds are actual values (absolute)
          {value.threshold_mode === 'ratio' && ' — this KPI still carries the legacy ratio mode'}
        </span>
      </div>
      {ladderConflict && (
        <p className="text-xs text-destructive">
          The ladder runs the other way (R5 {value.r5} vs R1 {value.r1}). Check the direction or the thresholds.
        </p>
      )}
      <div className="grid grid-cols-6 gap-1.5">
        {R_FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground font-semibold">{field}</Label>
            <Input
              className="h-8 text-xs"
              value={value[field]}
              onChange={(e) => set({ [field]: e.target.value } as Partial<KpiScoringState>)}
              placeholder="100"
            />
          </div>
        ))}
      </div>
      {error && <p className="text-sm text-destructive">{error}</p>}
    </div>
  );
}
