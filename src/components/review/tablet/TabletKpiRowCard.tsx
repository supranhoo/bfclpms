import { type ReactNode } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { renderBoldKpiText } from '@/components/ui/FormattedText';

/**
 * TabletKpiRowCard — compact KPI card used in the tablet tier (768–1279px)
 * of every monthly-KPI scorecard (Employee/Reviewer/Auditor/Management).
 * ADR-170 §4.1.
 *
 * Layout (portrait/single column, landscape/two columns via parent grid):
 *   ┌────────────────────────────────────────────────────┐
 *   │ [•dot] Category · KRA name          [weightage %] │
 *   │  KPI name (wrap, bold rendering)                   │
 *   ├────────────────────────────────────────────────────┤
 *   │ Target   |  Current  |  Score/Rating               │
 *   ├────────────────────────────────────────────────────┤
 *   │ [ action row — 44pt buttons, right-aligned ]       │
 *   └────────────────────────────────────────────────────┘
 *
 * The card is purely presentational; parent supplies action/entry slots so
 * business logic (score commit, evidence upload, send-back) stays in the
 * existing scorecard components.
 */
export interface TabletKpiRowCardProps {
  categoryName?: string | null;
  categoryColor?: string | null;
  kraName: string;
  kpiName: string;
  target: ReactNode;
  current?: ReactNode;
  score?: ReactNode;
  weightagePct?: number | null;
  /** Optional pill/badge shown next to the weightage (e.g., frequency). */
  headerRightExtra?: ReactNode;
  /** Score-entry slot (input + rating). Rendered below the metric row. */
  scoreEntry?: ReactNode;
  /** Action-row slot (Save/Send-back/Evidence buttons). Right-aligned. */
  actions?: ReactNode;
  /** Optional trailing meta line (e.g., "Last updated 2h ago"). */
  footerMeta?: ReactNode;
  /** Highlight the card (e.g., selected in split pane). */
  selected?: boolean;
  className?: string;
  onClick?: () => void;
}

export function TabletKpiRowCard({
  categoryName,
  categoryColor,
  kraName,
  kpiName,
  target,
  current,
  score,
  weightagePct,
  headerRightExtra,
  scoreEntry,
  actions,
  footerMeta,
  selected,
  className,
  onClick,
}: TabletKpiRowCardProps) {
  const clickable = typeof onClick === 'function';
  return (
    <Card
      className={cn(
        'p-4 space-y-3 transition-colors',
        selected && 'ring-2 ring-primary border-primary',
        clickable && 'cursor-pointer hover:bg-muted/40',
        className,
      )}
      onClick={onClick}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1">
          {categoryName && (
            <Badge
              variant="outline"
              className="flex items-center gap-1.5 w-fit"
              style={categoryColor ? { borderColor: categoryColor } : undefined}
            >
              <span
                className="w-2 h-2 rounded-full"
                style={categoryColor ? { backgroundColor: categoryColor } : undefined}
              />
              <span className="text-[11px]">{categoryName}</span>
            </Badge>
          )}
          <div className="text-sm font-medium leading-snug whitespace-pre-wrap break-words">
            {renderBoldKpiText(kraName)}
          </div>
          <div className="text-sm text-muted-foreground leading-snug whitespace-pre-wrap break-words">
            {renderBoldKpiText(kpiName)}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1 shrink-0">
          {typeof weightagePct === 'number' && (
            <Badge variant="secondary" className="text-[11px]">
              {weightagePct}%
            </Badge>
          )}
          {headerRightExtra}
        </div>
      </div>

      {/* Metric row */}
      <div className="grid grid-cols-3 gap-2 rounded-md bg-muted/40 p-2 text-sm">
        <MetricCell label="Target" value={target} />
        <MetricCell label="Current" value={current ?? '—'} />
        <MetricCell label="Score" value={score ?? '—'} align="right" />
      </div>

      {scoreEntry && <div className="pt-1">{scoreEntry}</div>}

      {actions && (
        <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
          {actions}
        </div>
      )}

      {footerMeta && (
        <div className="pt-1 text-[11px] text-muted-foreground">{footerMeta}</div>
      )}
    </Card>
  );
}

function MetricCell({
  label,
  value,
  align = 'left',
}: {
  label: string;
  value: ReactNode;
  align?: 'left' | 'right';
}) {
  return (
    <div className={cn('min-w-0', align === 'right' && 'text-right')}>
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <div className="text-sm font-medium truncate">{value}</div>
    </div>
  );
}