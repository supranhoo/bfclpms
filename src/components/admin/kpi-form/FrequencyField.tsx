/**
 * ADR-343 — Shared frequency field.
 *
 * Renders the canonical frequency list (SSOT: `FREQUENCY_OPTIONS`) plus the
 * cycle-anchor picker every multi-month frequency needs, regardless of the KPI
 * scoring type. Screens must use this instead of inlining option arrays.
 */
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  FREQUENCY_OPTIONS,
  MULTI_MONTH_FREQUENCIES,
  getCycleOptionsForFrequency,
} from '@/lib/frequencyCycleOptions';

interface FrequencyFieldProps {
  frequency: string;
  onFrequencyChange: (next: string) => void;
  /** Omit both anchor props to render the frequency select alone. */
  cycleStart?: string;
  onCycleStartChange?: (next: string) => void;
  label?: string;
  className?: string;
}

export function FrequencyField({
  frequency,
  onFrequencyChange,
  cycleStart,
  onCycleStartChange,
  label = 'Frequency',
  className = 'space-y-2',
}: FrequencyFieldProps) {
  const showAnchor =
    typeof onCycleStartChange === 'function' && MULTI_MONTH_FREQUENCIES.includes(frequency);
  const cycleOptions = showAnchor ? getCycleOptionsForFrequency(frequency) : undefined;

  return (
    <>
      <div className={className}>
        <Label className="text-sm font-medium">{label}</Label>
        <Select value={frequency} onValueChange={onFrequencyChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select frequency" />
          </SelectTrigger>
          <SelectContent>
            {FREQUENCY_OPTIONS.map((opt) => (
              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {showAnchor && cycleOptions && (
        <div className={className}>
          <Label className="text-sm font-medium">Cycle Start</Label>
          <Select value={cycleStart} onValueChange={onCycleStartChange!}>
            <SelectTrigger>
              <SelectValue placeholder="(Use system default)" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system_default">(Use system default)</SelectItem>
              {cycleOptions.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Override the global cycle start for this KPI</p>
        </div>
      )}
    </>
  );
}
