/**
 * ADR-272 / ADR-269 — Structured KPI text fields shared by "Assign New KRA"
 * and the "Admin KPI Editor".
 */
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Wand2 } from 'lucide-react';
import { KpiTextState, suggestTextState } from './kpiFormModel';

interface Props {
  value: KpiTextState;
  onChange: (next: KpiTextState) => void;
  /** Hides the free-text KPI name box when the caller renders its own. */
  hideName?: boolean;
  nameSlot?: React.ReactNode;
}

export function KpiTextSplitFields({ value, onChange, hideName, nameSlot }: Props) {
  const set = (patch: Partial<KpiTextState>) => onChange({ ...value, ...patch });
  const isStructured = value.kpi_title.trim().length > 0;

  return (
    <div className="space-y-3">
      {!hideName && (
        <div className="space-y-1.5">
          <Label className="text-xs">KPI Name (legacy free text)</Label>
          <Textarea
            value={value.kpi_name}
            onChange={(e) => set({ kpi_name: e.target.value })}
            rows={3}
            className="min-h-[80px] resize-y"
            disabled={isStructured}
          />
        </div>
      )}
      {nameSlot}

      <div className="rounded-md border p-3 space-y-3 bg-muted/20">
        <div className="flex items-center justify-between gap-2">
          <div>
            <Label className="text-xs font-semibold">Structured definition</Label>
            <p className="text-[11px] text-muted-foreground">
              {isStructured
                ? 'The KPI name is generated from these fields.'
                : 'Not split yet — this KPI still uses the legacy free text.'}
            </p>
          </div>
          {!isStructured && value.kpi_name.trim().length > 0 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8"
              onClick={() => onChange(suggestTextState(value.kpi_name))}
            >
              <Wand2 className="h-3.5 w-3.5 mr-1.5" />
              Split text
            </Button>
          )}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs">Title</Label>
          <Input
            className="h-9"
            value={value.kpi_title}
            onChange={(e) => set({ kpi_title: e.target.value })}
            placeholder="Short KPI title"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Description</Label>
          <Textarea
            rows={2}
            value={value.kpi_description}
            onChange={(e) => set({ kpi_description: e.target.value })}
            placeholder="What this KPI measures"
          />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Formula</Label>
            <Textarea
              rows={2}
              value={value.kpi_formula}
              onChange={(e) => set({ kpi_formula: e.target.value })}
              placeholder="How the value is derived"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Scoring Logic</Label>
            <Textarea
              rows={2}
              value={value.kpi_scoring_logic}
              onChange={(e) => set({ kpi_scoring_logic: e.target.value })}
              placeholder="How the rating is awarded"
            />
          </div>
        </div>
      </div>
    </div>
  );
}
