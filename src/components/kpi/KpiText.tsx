/**
 * ADR-269b — display layer for the forward-only KPI text split.
 *
 * Single decision point for "structured vs legacy": both components below call
 * `resolveKpiText()` and nothing else. Any KPI row without `kpi_title`
 * (i.e. every legacy assessment year) renders through the existing
 * `textFormatting` parser exactly as it did before this component existed.
 */
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { getKpiSummaryText } from '@/lib/textFormatting';
import { resolveKpiText, type KpiLikeRow } from '@/lib/kpiTextSplit';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp } from 'lucide-react';

/**
 * Resolved one-line KPI title.
 * - structured row → `kpi_title`
 * - legacy row     → today's `getKpiSummaryText(kpi_name)` output, unchanged
 */
export function KpiTitle({
  kpi,
  className,
  as: Tag = 'span',
  /** Override the legacy branch with the full text instead of the summary. */
  legacyFullText = false,
}: {
  kpi: KpiLikeRow | null | undefined;
  className?: string;
  as?: 'p' | 'span' | 'div' | 'h3';
  legacyFullText?: boolean;
}) {
  const parts = resolveKpiText(kpi);
  if (parts.isStructured && parts.title) {
    return <Tag className={className}>{parts.title}</Tag>;
  }
  const legacy = legacyFullText ? (kpi?.kpi_name ?? '') : getKpiSummaryText(kpi?.kpi_name);
  return <Tag className={cn('whitespace-pre-wrap', className)}>{renderBoldKpiText(legacy)}</Tag>;
}

function Block({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{value}</div>
    </div>
  );
}

/**
 * Full KPI text.
 * - structured row → labelled Description / Formula / Scoring Logic blocks
 *   (empty parts are omitted, never rendered as "—")
 * - legacy row     → `renderBoldKpiText(kpi_name)`, byte-for-byte as today
 */
export function KpiTextBlocks({
  kpi,
  className,
  /** Collapse Formula + Scoring Logic behind a toggle (used on small screens). */
  collapsible = false,
  showTitle = false,
}: {
  kpi: KpiLikeRow | null | undefined;
  className?: string;
  collapsible?: boolean;
  showTitle?: boolean;
}) {
  const parts = resolveKpiText(kpi);
  const [open, setOpen] = useState(false);

  if (!parts.isStructured) {
    return (
      <div className={cn('whitespace-pre-wrap text-sm', className)}>
        {renderBoldKpiText(kpi?.kpi_name)}
      </div>
    );
  }

  const secondary = [
    parts.formula ? { label: 'Formula', value: parts.formula } : null,
    parts.scoring_logic ? { label: 'Scoring Logic', value: parts.scoring_logic } : null,
  ].filter(Boolean) as Array<{ label: string; value: string }>;

  return (
    <div className={cn('space-y-2', className)}>
      {showTitle && parts.title ? <div className="text-sm font-medium">{parts.title}</div> : null}
      {parts.description ? <Block label="Description" value={parts.description} /> : null}

      {secondary.length > 0 && collapsible ? (
        <>
          <div className={cn('space-y-2', !open && 'hidden md:block')}>
            {secondary.map((b) => (
              <Block key={b.label} label={b.label} value={b.value} />
            ))}
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-xs md:hidden"
            onClick={() => setOpen((v) => !v)}
          >
            {open ? <ChevronUp className="mr-1 h-3 w-3" /> : <ChevronDown className="mr-1 h-3 w-3" />}
            {open ? 'Hide formula & scoring' : 'Show formula & scoring'}
          </Button>
        </>
      ) : (
        secondary.map((b) => <Block key={b.label} label={b.label} value={b.value} />)
      )}
    </div>
  );
}

/** True when the row carries structured text (used for the admin-only chip). */
export function isStructuredKpi(kpi: KpiLikeRow | null | undefined): boolean {
  return resolveKpiText(kpi).isStructured;
}
