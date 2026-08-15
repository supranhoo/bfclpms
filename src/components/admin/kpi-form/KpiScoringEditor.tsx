/**
 * ADR-272 / ADR-271 — Type-aware scoring editor shared by both KPI forms.
 * Value based -> R5..R0 + threshold mode. Yes/No -> polarity. Tiered -> builder.
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TieredOptionsBuilder } from '@/components/admin/TieredOptionsBuilder';
import { isBinaryInverted } from '@/lib/qualitativeUom';
import { KpiScoringState, ThresholdMode, binaryOptionsFor, validateScoringState } from './kpiFormModel';

interface Props {
  value: KpiScoringState;
  onChange: (next: KpiScoringState) => void;
}

const R_FIELDS = ['r5', 'r4', 'r3', 'r2', 'r1', 'r0'] as const;

export function KpiScoringEditor({ value, onChange }: Props) {
  const set = (patch: Partial<KpiScoringState>) => onChange({ ...value, ...patch });
  const error = validateScoringState(value);

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
        <Label className="text-xs whitespace-nowrap">Threshold Mode</Label>
        <Select
          value={value.threshold_mode}
          onValueChange={(v: ThresholdMode) => set({ threshold_mode: v })}
        >
          <SelectTrigger className="h-8 w-[200px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="absolute">Absolute (Recommended)</SelectItem>
            <SelectItem value="ratio">Ratio / Percentage</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">
          {value.threshold_mode === 'absolute' ? 'Actual values' : '% of target'}
        </span>
      </div>
      <div className="grid grid-cols-6 gap-1.5">
        {R_FIELDS.map((field) => (
          <div key={field} className="space-y-1">
            <Label className="text-[10px] uppercase text-muted-foreground font-semibold">{field}</Label>
            <Input
              className="h-8 text-xs"
              value={value[field]}
              onChange={(e) => set({ [field]: e.target.value } as Partial<KpiScoringState>)}
              placeholder={value.threshold_mode === 'absolute' ? '100' : '100%'}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
