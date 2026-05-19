import { cn } from '@/lib/utils';

/**
 * Renders a side-by-side comparison of one attribute (e.g. frequency, r0..r5)
 * across Definition A and Definition B in the merge candidates table.
 *
 * Visual states:
 *   - both values present + equal     → muted text, no warning
 *   - both values present + different → amber text + ⚠ indicator
 *   - either value missing            → "—" muted
 *   - mixedA / mixedB                 → small dot next to the affected side
 *
 * Pure presentational, no data fetching, safe to unit-test.
 */
export interface CompareCellProps {
  a: string | null | undefined;
  b: string | null | undefined;
  mixedA?: boolean;
  mixedB?: boolean;
  className?: string;
}

function fmt(v: string | null | undefined): string {
  if (v == null) return '—';
  const s = String(v).trim();
  return s.length === 0 ? '—' : s;
}

export function CompareCell({ a, b, mixedA, mixedB, className }: CompareCellProps) {
  const aStr = fmt(a);
  const bStr = fmt(b);
  const bothPresent = aStr !== '—' && bStr !== '—';
  const equal = bothPresent && aStr === bStr;
  const differ = bothPresent && !equal;

  const valueClass = cn(
    'leading-tight tabular-nums',
    differ && 'text-amber-700 dark:text-amber-400 font-medium',
    !bothPresent && 'text-muted-foreground',
    equal && 'text-foreground',
  );

  return (
    <div
      className={cn(
        'flex flex-col gap-0.5 text-[11px] min-w-[2.5rem]',
        differ && 'bg-amber-50 dark:bg-amber-950/30 rounded px-1 py-0.5',
        className,
      )}
      title={
        differ
          ? `Differs — A: ${aStr} · B: ${bStr}`
          : equal
            ? `Equal: ${aStr}`
            : 'Not available'
      }
    >
      <span className={valueClass}>
        {aStr}
        {mixedA && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" title="Linked KPIs disagree on this value" />}
      </span>
      <span className={valueClass}>
        {bStr}
        {mixedB && <span className="ml-0.5 inline-block h-1.5 w-1.5 rounded-full bg-amber-500 align-middle" title="Linked KPIs disagree on this value" />}
      </span>
    </div>
  );
}
