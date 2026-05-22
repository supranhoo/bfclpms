import { useRef } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import type { BulkReviewRow } from '@/hooks/useBulkReview';

interface Props {
  rows: BulkReviewRow[];
  selectedIds: Set<string>;
  onToggleOne: (id: string) => void;
  onToggleAll: () => void;
  onRowClick: (row: BulkReviewRow) => void;
}

const ROW_HEIGHT = 36;
// 9 columns: checkbox | employee | KRA/KPI | self | mgr | skip | hr | aud | mgmt | final
// (employee + KRA take flexible space; numeric columns are fixed)
const COL_TEMPLATE =
  '32px minmax(180px, 1.2fr) minmax(220px, 2fr) 56px 56px 56px 56px 56px 60px 64px';

function fmt(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return Number(n).toFixed(1);
}

export function BulkReviewVirtualGrid({
  rows, selectedIds, onToggleOne, onToggleAll, onRowClick,
}: Props) {
  const parentRef = useRef<HTMLDivElement>(null);

  const virt = useVirtualizer({
    count: rows.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 12,
  });

  const allChecked = rows.length > 0 && selectedIds.size === rows.length;

  return (
    <div className="border rounded-md overflow-hidden">
      {/* Header */}
      <div
        className="grid bg-muted/50 text-xs font-medium border-b sticky top-0 z-10"
        style={{ gridTemplateColumns: COL_TEMPLATE }}
      >
        <div className="p-2 flex items-center justify-center">
          <Checkbox checked={allChecked} onCheckedChange={onToggleAll} />
        </div>
        <div className="p-2 text-left">Employee</div>
        <div className="p-2 text-left">KRA / KPI</div>
        <div className="p-2 text-right">Self</div>
        <div className="p-2 text-right">Mgr</div>
        <div className="p-2 text-right">Skip</div>
        <div className="p-2 text-right">HR</div>
        <div className="p-2 text-right">Aud</div>
        <div className="p-2 text-right">Mgmt</div>
        <div className="p-2 text-right">Final</div>
      </div>

      {/* Virtualized body */}
      <div
        ref={parentRef}
        className="overflow-auto"
        style={{ maxHeight: '60vh' }}
      >
        <div
          style={{
            height: `${virt.getTotalSize()}px`,
            position: 'relative',
            width: '100%',
          }}
        >
          {virt.getVirtualItems().map((vi) => {
            const r = rows[vi.index];
            const scoreVals = [
              r.self_score, r.manager_score, r.skip_level_score,
              r.hr_pms_score, r.auditor_score, r.management_score,
            ].filter((s): s is number => s !== null && s !== undefined);
            const rowVar = scoreVals.length >= 2
              ? Math.max(...scoreVals) - Math.min(...scoreVals) : 0;
            const checked = r.submission_id ? selectedIds.has(r.submission_id) : false;

            return (
              <div
                key={r.kpi_id + ':' + r.employee_id}
                className="grid border-b text-xs hover:bg-muted/30 cursor-pointer absolute left-0 right-0"
                style={{
                  gridTemplateColumns: COL_TEMPLATE,
                  transform: `translateY(${vi.start}px)`,
                  height: `${ROW_HEIGHT}px`,
                }}
                onClick={() => onRowClick(r)}
              >
                <div
                  className="p-2 flex items-center justify-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    checked={checked}
                    disabled={!r.submission_id}
                    onCheckedChange={() => r.submission_id && onToggleOne(r.submission_id)}
                  />
                </div>
                <div className="p-2 truncate">
                  {r.employee_name}
                  {r.employee_code && (
                    <span className="text-muted-foreground ml-1">· {r.employee_code}</span>
                  )}
                </div>
                <div
                  className="p-2 flex items-center gap-2 min-w-0"
                  title={`${r.kra_name} · ${r.kpi_name}`}
                >
                  <span className="truncate">
                    <span className="text-muted-foreground">{r.kra_name}</span> · {r.kpi_name}
                  </span>
                  {rowVar > 1.0 && (
                    <Badge variant="destructive" className="text-[10px] shrink-0">
                      Δ {rowVar.toFixed(1)}
                    </Badge>
                  )}
                </div>
                <div className="p-2 text-right">{fmt(r.self_score)}</div>
                <div className="p-2 text-right">{fmt(r.manager_score)}</div>
                <div className="p-2 text-right">{fmt(r.skip_level_score)}</div>
                <div className="p-2 text-right">{fmt(r.hr_pms_score)}</div>
                <div className="p-2 text-right">{fmt(r.auditor_score)}</div>
                <div className="p-2 text-right">{fmt(r.management_score)}</div>
                <div className="p-2 text-right font-medium">{fmt(r.final_score)}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}