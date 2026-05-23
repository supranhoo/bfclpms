import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import type { BulkReviewRow } from '@/hooks/useBulkReview';

type ViewerStage =
  | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management';

const STAGE_SCORE_KEY: Record<ViewerStage, keyof BulkReviewRow> = {
  manager: 'manager_score',
  skip_level: 'skip_level_score',
  hr_pms: 'hr_pms_score',
  auditor: 'auditor_score',
  management: 'management_score',
};

interface KpiRowKey {
  key: string;            // kraName|kpiName
  kraName: string;
  kpiName: string;
  category: string;       // we don't have category in BulkReviewRow → fall back to KRA
  weightage: number | null;
}

interface EmployeeCol {
  id: string;
  name: string;
  code: string | null;
  initials: string;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function varianceTone(row: BulkReviewRow): 'ok' | 'warn' | 'bad' | null {
  const scores = [
    row.self_score, row.manager_score, row.skip_level_score,
    row.hr_pms_score, row.auditor_score, row.management_score,
  ].filter((s): s is number => s !== null && s !== undefined);
  if (scores.length < 2) return null;
  const spread = Math.max(...scores) - Math.min(...scores);
  if (spread > 2) return 'bad';
  if (spread > 1) return 'warn';
  return 'ok';
}

export interface BulkReviewMatrixGridProps {
  rows: BulkReviewRow[];
  viewerStage: string;
  selectedSubmissionIds: Set<string>;
  onToggleSubmission: (submissionId: string) => void;
  onToggleAll: (allIds: string[]) => void;
  onCellClick: (row: BulkReviewRow) => void;
  displayMode?: 'score' | 'wt' | 'both';
}

export function BulkReviewMatrixGrid({
  rows, viewerStage, selectedSubmissionIds,
  onToggleSubmission, onToggleAll, onCellClick,
  displayMode = 'score',
}: BulkReviewMatrixGridProps) {
  const [showMeta, setShowMeta] = useState(false);
  const [collapsedKras, setCollapsedKras] = useState<Set<string>>(new Set());

  const stageKey = STAGE_SCORE_KEY[(viewerStage as ViewerStage)] ?? 'manager_score';

  const { kpiRows, employees, cellMap, kraGroups } = useMemo(() => {
    const kpiMap = new Map<string, KpiRowKey>();
    const empMap = new Map<string, EmployeeCol>();
    const cell = new Map<string, BulkReviewRow>(); // `${kpiKey}::${empId}` → row

    for (const r of rows) {
      const kpiKey = `${r.kra_name}|${r.kpi_name}`;
      if (!kpiMap.has(kpiKey)) {
        kpiMap.set(kpiKey, {
          key: kpiKey,
          kraName: r.kra_name,
          kpiName: r.kpi_name,
          category: r.kra_name,
          weightage: r.weightage,
        });
      }
      if (!empMap.has(r.employee_id)) {
        empMap.set(r.employee_id, {
          id: r.employee_id,
          name: r.employee_name,
          code: r.employee_code,
          initials: initials(r.employee_name || ''),
        });
      }
      cell.set(`${kpiKey}::${r.employee_id}`, r);
    }

    const kpiRowsArr = Array.from(kpiMap.values()).sort((a, b) => {
      const k = a.kraName.localeCompare(b.kraName);
      return k !== 0 ? k : a.kpiName.localeCompare(b.kpiName);
    });
    const employeesArr = Array.from(empMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    // Group by KRA for collapsible bands
    const groups = new Map<string, KpiRowKey[]>();
    for (const k of kpiRowsArr) {
      if (!groups.has(k.kraName)) groups.set(k.kraName, []);
      groups.get(k.kraName)!.push(k);
    }

    return { kpiRows: kpiRowsArr, employees: employeesArr, cellMap: cell, kraGroups: groups };
  }, [rows]);

  const allSubmissionIds = useMemo(
    () => rows.filter(r => r.submission_id).map(r => r.submission_id!),
    [rows],
  );
  const allSelected = allSubmissionIds.length > 0
    && allSubmissionIds.every(id => selectedSubmissionIds.has(id));

  const toggleKra = (kra: string) => {
    setCollapsedKras(prev => {
      const next = new Set(prev);
      if (next.has(kra)) next.delete(kra); else next.add(kra);
      return next;
    });
  };

  const KPI_COL_W = 280;
  const EMP_COL_W = 120;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-1">
        <div className="flex items-center gap-2">
          <Switch id="show-meta" checked={showMeta} onCheckedChange={setShowMeta} />
          <Label htmlFor="show-meta" className="text-xs font-medium cursor-pointer">
            Show KRA · Wt%
          </Label>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground tabular-nums">{kpiRows.length}</strong> KPIs</span>
          <span><strong className="text-foreground tabular-nums">{employees.length}</strong> employees</span>
          <span><strong className="text-foreground tabular-nums">{rows.length}</strong> cells</span>
        </div>
      </div>

      {/* Matrix surface */}
      <div className="rounded-lg border border-border bg-card overflow-hidden">
        <div className="overflow-auto max-h-[calc(100vh-360px)] relative">
          <table className="border-separate border-spacing-0 w-full">
            <thead>
              <tr>
                {/* Top-left frozen corner */}
                <th
                  className="sticky top-0 left-0 z-40 bg-muted/40 border-b border-r border-border p-3 text-left shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.12)]"
                  style={{ minWidth: KPI_COL_W, width: KPI_COL_W }}
                >
                  <div className="flex items-center gap-2">
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={() => onToggleAll(allSubmissionIds)}
                      aria-label="Select all"
                    />
                    <span className="text-[10px] uppercase font-bold tracking-widest text-muted-foreground">
                      KPI / KRA
                    </span>
                  </div>
                </th>
                {/* Employee headers */}
                {employees.map((e) => (
                  <th
                    key={e.id}
                    className="sticky top-0 z-30 bg-muted/40 border-b border-r border-border p-2"
                    style={{ minWidth: EMP_COL_W, width: EMP_COL_W }}
                  >
                    <div className="flex flex-col items-center gap-1.5">
                      <div className="w-8 h-8 rounded-full bg-primary/90 text-primary-foreground flex items-center justify-center text-[11px] font-bold">
                        {e.initials}
                      </div>
                      <div className="text-[11px] font-semibold leading-tight text-center line-clamp-2 max-w-[110px]">
                        {e.name}
                      </div>
                      {e.code && (
                        <div className="text-[9px] text-muted-foreground tabular-nums">
                          {e.code}
                        </div>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Array.from(kraGroups.entries()).map(([kraName, group]) => {
                const collapsed = collapsedKras.has(kraName);
                return (
                  <>
                    {/* Category band */}
                    <tr key={`band-${kraName}`} className="bg-muted/30">
                      <td
                        colSpan={employees.length + 1}
                        className="sticky left-0 z-20 px-3 py-1.5 border-b border-border bg-muted/30"
                      >
                        <button
                          onClick={() => toggleKra(kraName)}
                          className="flex items-center gap-2 text-left w-full hover:opacity-80"
                        >
                          {collapsed
                            ? <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />
                            : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
                          <span className="text-[10px] font-bold uppercase tracking-widest text-foreground">
                            KRA: {kraName}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            · {group.length} KPI{group.length === 1 ? '' : 's'}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!collapsed && group.map((kpi) => (
                      <tr key={kpi.key} className="group">
                        {/* Sticky KPI cell */}
                        <td
                          className="sticky left-0 z-10 bg-card group-hover:bg-muted/40 border-b border-r border-border p-3 align-top shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.08)]"
                          style={{ minWidth: KPI_COL_W, width: KPI_COL_W }}
                        >
                          <div className="text-xs font-semibold leading-snug text-foreground line-clamp-2">
                            {kpi.kpiName}
                          </div>
                          {showMeta && (
                            <div className="text-[10px] text-muted-foreground mt-1">
                              {kpi.kraName}
                              {kpi.weightage != null && (
                                <> · <span className="tabular-nums">{kpi.weightage}%</span></>
                              )}
                            </div>
                          )}
                        </td>
                        {/* Employee cells */}
                        {employees.map((emp) => {
                          const row = cellMap.get(`${kpi.key}::${emp.id}`);
                          if (!row) {
                            return (
                              <td
                                key={emp.id}
                                className="border-b border-r border-border bg-muted/10"
                                style={{ minWidth: EMP_COL_W, width: EMP_COL_W }}
                              >
                                <div className="h-14 flex items-center justify-center text-[10px] text-muted-foreground/40">
                                  —
                                </div>
                              </td>
                            );
                          }
                          const score = row[stageKey] as number | null | undefined;
                          const isNa = row.is_na === true;
                          const tone = varianceTone(row);
                          const isSelected = !!row.submission_id && selectedSubmissionIds.has(row.submission_id);
                          return (
                            <td
                              key={emp.id}
                              className={cn(
                                'border-b border-r border-border p-0 relative',
                                isSelected && 'ring-2 ring-primary ring-inset',
                              )}
                              style={{ minWidth: EMP_COL_W, width: EMP_COL_W }}
                            >
                              <button
                                onClick={() => onCellClick(row)}
                                className="w-full h-14 flex items-center justify-center hover:bg-primary/5 transition-colors cursor-pointer relative"
                              >
                                {isNa ? (
                                  <span className="text-[10px] font-bold text-muted-foreground uppercase">N/A</span>
                                ) : (
                                  <div className="flex flex-col items-center leading-tight">
                                    {(displayMode === 'wt' || displayMode === 'both') && kpi.weightage != null && (
                                      <span className={cn(
                                        'tabular-nums text-muted-foreground',
                                        displayMode === 'wt' ? 'text-sm font-bold text-foreground' : 'text-[10px]',
                                      )}>
                                        {kpi.weightage}%
                                      </span>
                                    )}
                                    {(displayMode === 'score' || displayMode === 'both') && (
                                      score != null ? (
                                        <span className="text-sm font-bold tabular-nums text-foreground">
                                          {Number(score).toFixed(1)}
                                        </span>
                                      ) : (
                                        <span className="text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wide border border-dashed border-border rounded px-1.5 py-0.5">
                                          Pending
                                        </span>
                                      )
                                    )}
                                  </div>
                                )}
                                {tone && (
                                  <span
                                    className={cn(
                                      'absolute top-1.5 right-1.5 w-1.5 h-1.5 rounded-full',
                                      tone === 'ok' && 'bg-emerald-500',
                                      tone === 'warn' && 'bg-amber-400',
                                      tone === 'bad' && 'bg-red-500',
                                    )}
                                  />
                                )}
                              </button>
                              {row.submission_id && (
                                <div
                                  className="absolute top-1 left-1 opacity-0 group-hover:opacity-100 transition-opacity"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <Checkbox
                                    checked={isSelected}
                                    onCheckedChange={() => onToggleSubmission(row.submission_id!)}
                                    className="h-3.5 w-3.5"
                                    aria-label="Select cell"
                                  />
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 px-1 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" /> Variance ≤ 1.0
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> 1.0 – 2.0
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-red-500" /> &gt; 2.0
        </span>
        <span className="ml-auto">Click a cell to score, re-open, or view evidence</span>
      </div>
    </div>
  );
}