import { type ReactNode } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';

/**
 * TabletScoreEntry — tablet-optimised score-entry surface.
 * ADR-170 §4.1 · POLICY §UX-TABLET-BREAKPOINT-CONTRACT.
 *
 * Wraps a numeric/text input at 48pt height with an inline R1–R5 segmented
 * selector (44pt cells). Business logic is delegated to the caller — this
 * component only enforces tap-target contract and layout.
 */
export interface TabletScoreEntryProps {
  label?: string;
  value: string | number;
  onChange: (next: string) => void;
  onCommit?: () => void;
  inputMode?: 'decimal' | 'numeric' | 'text';
  placeholder?: string;
  disabled?: boolean;
  /** Currently-selected rating (1..5) if using segmented selector. */
  rating?: number | null;
  onRatingChange?: (rating: number) => void;
  showRatingSelector?: boolean;
  /** Right-side slot for evidence/notes button, etc. */
  trailing?: ReactNode;
  helperText?: ReactNode;
  errorText?: ReactNode;
  suffix?: ReactNode;
}

const RATINGS = [1, 2, 3, 4, 5] as const;

export function TabletScoreEntry({
  label,
  value,
  onChange,
  onCommit,
  inputMode = 'decimal',
  placeholder,
  disabled,
  rating,
  onRatingChange,
  showRatingSelector = true,
  trailing,
  helperText,
  errorText,
  suffix,
}: TabletScoreEntryProps) {
  return (
    <div className="space-y-2">
      {label && (
        <Label className="text-xs text-muted-foreground">{label}</Label>
      )}
      <div className="flex items-stretch gap-2">
        <div className="relative flex-1">
          <Input
            className="h-12 text-base pr-10"
            inputMode={inputMode}
            value={value ?? ''}
            onChange={(e) => onChange(e.target.value)}
            onBlur={onCommit}
            placeholder={placeholder}
            disabled={disabled}
          />
          {suffix && (
            <div className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
              {suffix}
            </div>
          )}
        </div>
        {trailing}
      </div>

      {showRatingSelector && onRatingChange && (
        <div className="grid grid-cols-5 gap-1" role="radiogroup" aria-label="Rating">
          {RATINGS.map((r) => {
            const active = rating === r;
            return (
              <Button
                key={r}
                type="button"
                variant={active ? 'default' : 'outline'}
                size="sm"
                disabled={disabled}
                onClick={() => onRatingChange(r)}
                aria-checked={active}
                role="radio"
                className={cn(
                  'min-h-11 min-w-11 text-sm font-medium',
                  active && 'shadow-sm',
                )}
              >
                R{r}
              </Button>
            );
          })}
        </div>
      )}

      {errorText && (
        <p className="text-xs text-destructive" role="alert">
          {errorText}
        </p>
      )}
      {!errorText && helperText && (
        <p className="text-xs text-muted-foreground">{helperText}</p>
      )}
    </div>
  );
}