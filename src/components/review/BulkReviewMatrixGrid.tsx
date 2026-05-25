import { Fragment, useMemo, useState } from 'react';
import {
  ChevronDown, ChevronRight, ChevronsDown, ChevronsUp, Building,
  Crosshair, X,
} from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import type { BulkReviewRow } from '@/hooks/useBulkReview';
import { classifyOrgKpiRow } from '@/lib/orgKpiGap';
import {
  kpiRowKey as makeKpiRowKey, submissionIdsForKpiRow, toggleKpiRowSelection,
} from '@/lib/bulkRowSelection';

type ViewerStage =
  | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management';

function OrgKpiBadge({ status }: { status?: ReturnType<typeof classifyOrgKpiRow> }) {
  if (!status || status.status === 'none') return null;
  const isGap = status.status === 'gap';
  const sample = status.missingEmployeeNames.slice(0, 5);
  const extra = status.missingEmployeeNames.length - sample.length;
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant="outline"
            className={cn(
              'shrink-0 h-4 px-1 text-[9px] font-bold gap-0.5 uppercase tracking-wide cursor-help',
              isGap
                ? 'border-amber-500/60 text-amber-700 bg-amber-50 dark:bg-amber-950/40 dark:text-amber-300'
                : 'border-emerald-500/60 text-emerald-700 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300',
            )}
          >
            <Building className="h-2.5 w-2.5" />
            ORG{isGap && <span>·gap</span>}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-[280px] text-xs">
          {isGap ? (
            <div className="space-y-1">
              <div className="font-semibold">Org-KPI mapping gap</div>
              <div>
                Mapped for <strong>{status.mappedCount}</strong> of{' '}
                <strong>{status.totalCount}</strong> employees.
              </div>
              <div className="text-muted-foreground">
                Missing for: {sample.join(', ')}
                {extra > 0 && ` and ${extra} more`}
              </div>
            </div>
          ) : (
            <div>
              Org-level KPI for all <strong>{status.totalCount}</strong>{' '}
              employees in this row.
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

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
  /** Optional map: kpi_id → is_org_level. When absent, ORG badge is hidden. */
  isOrgByKpiId?: ReadonlyMap<string, boolean>;
  /**
   * When set, the matrix renders ONLY the KPI row matching this key
   * (`<kra_name>|<kpi_name>`). All employee columns and selection still
   * function. Pair with `onFocusKpi` to toggle the focus from the row UI.
   */
  kpiFocusKey?: string | null;
  /** Sets/clears the focus key. When omitted, the focus affordance hides. */
  onFocusKpi?: (rowKey: string | null) => void;
  /**
   * Replace the entire selection set. Used by the row-level horizontal
   * select handle so it can preserve selections in other rows.
   */
  onReplaceSelection?: (next: Set<string>) => void;
}

export function BulkReviewMatrixGrid({
  rows, viewerStage, selectedSubmissionIds,
  onToggleSubmission, onToggleAll, onCellClick,
  displayMode = 'score',
  isOrgByKpiId,
  kpiFocusKey,
  onFocusKpi,
  onReplaceSelection,
}: BulkReviewMatrixGridProps) {
  const [showMeta, setShowMeta] = useState(false);
  const [collapsedKras, setCollapsedKras] = useState<Set<string>>(new Set());

  const stageKey = STAGE_SCORE_KEY[(viewerStage as ViewerStage)] ?? 'manager_score';

  const { kpiRows, employees, cellMap, kraGroups, orgStatusByKpiKey } = useMemo(() => {
    const kpiMap = new Map<string, KpiRowKey>();
    const empMap = new Map<string, EmployeeCol>();
    const cell = new Map<string, BulkReviewRow>(); // `${kpiKey}::${empId}` → row

    // When a KPI focus is active, narrow rows to that KPI only. Employees,
    // selection, scoring all keep working — the matrix simply collapses to
    // a single horizontal band of cells for that KPI.
    const sourceRows = kpiFocusKey
      ? rows.filter(r => makeKpiRowKey(r) === kpiFocusKey)
      : rows;
    for (const r of sourceRows) {
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

    // Org-KPI per row (kpi grouping across employees).
    const orgMap = new Map<string, ReturnType<typeof classifyOrgKpiRow>>();
    if (isOrgByKpiId) {
      const nameById = new Map(employeesArr.map(e => [e.id, e.name]));
      for (const k of kpiRowsArr) {
        const kpiIds: string[] = [];
        const empIds: string[] = [];
        for (const e of employeesArr) {
          const c = cell.get(`${k.key}::${e.id}`);
          if (c) { kpiIds.push(c.kpi_id); empIds.push(e.id); }
        }
        orgMap.set(k.key, classifyOrgKpiRow({
          kpiIds, employeeIds: empIds, isOrgByKpiId, employeeNameById: nameById,
        }));
      }
    }

    return {
      kpiRows: kpiRowsArr, employees: employeesArr, cellMap: cell,
      kraGroups: groups, orgStatusByKpiKey: orgMap,
    };
  }, [rows, isOrgByKpiId, kpiFocusKey]);

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
  const collapseAll = () => setCollapsedKras(new Set(kraGroups.keys()));
  const expandAll = () => setCollapsedKras(new Set());
  const allCollapsed = kraGroups.size > 0 && kraGroups.size === collapsedKras.size;

  const KPI_COL_W = 260;
  const EMP_COL_W = 112;
  const totalW = KPI_COL_W + employees.length * EMP_COL_W;

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center justify-between flex-wrap gap-3 px-1">
        <div className="flex items-center gap-2">
          <Switch id="show-meta" checked={showMeta} onCheckedChange={setShowMeta} />
          <Label htmlFor="show-meta" className="text-xs font-medium cursor-pointer">
            Show KRA · Wt%
          </Label>
          <div className="ml-2 flex items-center gap-1 pl-2 border-l border-border/50">
            <Button
              type="button" size="sm" variant="ghost"
              className="h-7 px-2 text-[11px] gap-1"
              onClick={expandAll}
              disabled={collapsedKras.size === 0}
              title="Expand all KRAs"
            >
              <ChevronsDown className="h-3 w-3" /> Expand all
            </Button>
            <Button
              type="button" size="sm" variant="ghost"
              className="h-7 px-2 text-[11px] gap-1"
              onClick={collapseAll}
              disabled={allCollapsed}
              title="Collapse all KRAs"
            >
              <ChevronsUp className="h-3 w-3" /> Collapse all
            </Button>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span><strong className="text-foreground tabular-nums">{kpiRows.length}</strong> KPIs</span>
          <span><strong className="text-foreground tabular-nums">{employees.length}</strong> employees</span>
          <span><strong className="text-foreground tabular-nums">{rows.length}</strong> cells</span>
        </div>
      </div>

      {/* Matrix surface — horizontal scroll for employees, sticky KPI/KRA column */}
      <div className="rounded-lg border border-border bg-card">
        <div className="matrix-scroll overflow-auto max-h-[calc(100vh-180px)] relative isolate rounded-lg">
          <table
            className="border-separate border-spacing-0"
            style={{ width: totalW, minWidth: '100%' }}
          >
            <thead>
              <tr>
                {/* Top-left frozen corner */}
                <th
                  className="sticky top-0 left-0 z-50 bg-muted border-b border-r border-border p-3 text-left shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.12)]"
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
                    className="sticky top-0 z-40 bg-muted border-b border-r border-border p-2"
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
                  <Fragment key={kraName}>
                    {/* Category band */}
                    <tr className="bg-muted">
                      <td
                        colSpan={employees.length + 1}
                        className="px-3 py-1.5 border-b border-border bg-muted"
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
                    {!collapsed && group.map((kpi, idx) => {
                      const zebra = idx % 2 === 1;
                      const rowBg = zebra ? 'bg-muted/30' : 'bg-card';
                      return (
                      <tr key={kpi.key} className="group">
                        {/* Sticky KPI cell */}
                        <td
                          className={cn(
                            'sticky left-0 z-30 border-b border-r border-border p-3 align-top shadow-[4px_0_8px_-4px_hsl(var(--foreground)/0.08)]',
                            rowBg,
                          )}
                          style={{ minWidth: KPI_COL_W, width: KPI_COL_W }}
                        >
                          <div className="flex items-start gap-1.5">
                            <div className="text-xs font-semibold leading-snug text-foreground line-clamp-2 flex-1 min-w-0">
                              {kpi.kpiName}
                            </div>
                            <OrgKpiBadge status={orgStatusByKpiKey?.get(kpi.key)} />
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
                                className={cn('border-b border-r border-border', rowBg)}
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
                                rowBg,
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
                      );
                    })}
                  </Fragment>
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