import { cn } from '@/lib/utils';
import { Check, AlertTriangle } from 'lucide-react';
import type { ScannerVariant } from '@/lib/scanGroupsDedup';

/**
 * Compact one-row strip rendered under each scanner-variant card in the
 * Build Registry tab. Shows Frequency + R0..R5 plus a Criteria / UoM
 * context line so admins can confirm at a glance that the variants in a
 * merge group are scoring the same way.
 *
 * - Values that differ from the group baseline are highlighted in amber.
 * - "mixed" cells (where the underlying kpis rows disagree on the value)
 *   render an amber dot.
 * - Missing values render as an em-dash.
 *
 * Pure presentational — no data fetching.
 */
export interface VariantScaleStripProps {
  variant: ScannerVariant;
  /** First variant in the same group; used as the comparison baseline. */
  baseline?: ScannerVariant;
  /** Disable the match/differs chip (e.g. when this row IS the baseline). */
  isBaseline?: boolean;
  className?: string;
}

type RKey = 'r0' | 'r1' | 'r2' | 'r3' | 'r4' | 'r5';
type StripKey = 'frequency' | RKey;

const R_KEYS: RKey[] = ['r0', 'r1', 'r2', 'r3', 'r4', 'r5'];

function norm(v: string | null | undefined): string {
  if (v == null) return '';
  return String(v).trim();
}

function fmt(v: string | null | undefined): string {
  const s = norm(v);
  return s.length === 0 ? '—' : s;
}

function mixedFlag(variant: ScannerVariant, key: StripKey | 'criteria' | 'uom'): boolean {
  const k = `${key}_mixed` as keyof ScannerVariant;
  return Boolean(variant[k]);
}

function cellsDiffer(
  variant: ScannerVariant,
  baseline: ScannerVariant | undefined,
  key: StripKey,
): boolean {
  if (!baseline || baseline === variant) return false;
  const a = norm(variant[key] as string | null | undefined);
  const b = norm(baseline[key] as string | null | undefined);
  if (a === '' || b === '') return false; // only flag when both sides have data
  return a.toLowerCase() !== b.toLowerCase();
}

interface CellProps {
  label: string;
  value: string | null | undefined;
  differs: boolean;
  mixed: boolean;
}

function Cell({ label, value, differs, mixed }: CellProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-start gap-0.5 min-w-[3rem] px-1.5 py-1 rounded',
        differs && 'bg-amber-50 dark:bg-amber-950/30',
      )}
      title={
        differs
          ? `${label}: ${fmt(value)} — differs from baseline`
          : mixed
            ? `${label}: ${fmt(value)} — underlying KPIs disagree`
            : `${label}: ${fmt(value)}`
      }
    >
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span
        className={cn(
          'text-xs leading-tight tabular-nums font-medium flex items-center gap-1',
          differs && 'text-amber-700 dark:text-amber-400',
          fmt(value) === '—' && 'text-muted-foreground font-normal',
        )}
      >
        {fmt(value)}
        {mixed && (
          <span
            data-testid="mixed-dot"
            className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
            title="Underlying KPIs disagree on this value"
          />
        )}
      </span>
    </div>
  );
}

export function VariantScaleStrip({
  variant,
  baseline,
  isBaseline,
  className,
}: VariantScaleStripProps) {
  const compareKeys: StripKey[] = ['frequency', ...R_KEYS];
  const anyDiffer = !isBaseline && baseline
    ? compareKeys.some(k => cellsDiffer(variant, baseline, k))
    : false;

  const criteria = norm(variant.criteria);
  const uom = norm(variant.uom);
  const criteriaMixed = mixedFlag(variant, 'criteria');
  const uomMixed = mixedFlag(variant, 'uom');

  return (
    <div
      className={cn(
        'mt-2 rounded-md border border-border/60 bg-muted/30 px-2 py-1.5',
        className,
      )}
      data-testid="variant-scale-strip"
    >
      <div className="flex flex-wrap items-stretch gap-1">
        <Cell
          label="Freq"
          value={variant.frequency}
          differs={cellsDiffer(variant, baseline, 'frequency')}
          mixed={mixedFlag(variant, 'frequency')}
        />
        {R_KEYS.map(k => (
          <Cell
            key={k}
            label={k.toUpperCase()}
            value={variant[k]}
            differs={cellsDiffer(variant, baseline, k)}
            mixed={mixedFlag(variant, k)}
          />
        ))}
        {!isBaseline && baseline && (
          <div className="ml-auto flex items-center pr-1">
            {anyDiffer ? (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-50 dark:bg-amber-950/30 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400"
                title="One or more scale values differ from the baseline variant"
              >
                <AlertTriangle className="h-3 w-3" /> differs
              </span>
            ) : (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-50 dark:bg-emerald-950/30 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-400"
                title="Frequency and rating scale match the baseline variant"
              >
                <Check className="h-3 w-3" /> match
              </span>
            )}
          </div>
        )}
      </div>
      {(criteria || uom) && (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
          {criteria && (
            <span className="flex items-center gap-1">
              <span className="uppercase tracking-wide">Criteria:</span>
              <span className="text-foreground/80">{criteria}</span>
              {criteriaMixed && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                  title="Underlying KPIs disagree on criteria"
                />
              )}
            </span>
          )}
          {uom && (
            <span className="flex items-center gap-1">
              <span className="uppercase tracking-wide">UoM:</span>
              <span className="text-foreground/80">{uom}</span>
              {uomMixed && (
                <span
                  className="inline-block h-1.5 w-1.5 rounded-full bg-amber-500"
                  title="Underlying KPIs disagree on unit of measure"
                />
              )}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
