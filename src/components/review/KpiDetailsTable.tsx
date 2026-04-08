/**
 * Unified KPI Details Table Component
 * Displays KPIs with dynamic score columns based on status progression
 * Used across My KPIs, Team Review, Audit, and Management views
 */

import React, { useState, useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KPI, ReviewSubmission, KpiQuery, ReviewStatus } from '@/hooks/useKpis';
import { InlineDailySubmissionRow } from '@/components/review/InlineDailySubmissionRow';
import { DailyBadge } from '@/components/review/DailyKpiExpandButton';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { getKpiSummaryText } from '@/lib/textFormatting';
import { canReviewKpi as workflowCanReview, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { 
  Info, Lock, CheckCircle2, Calendar, ChevronDown, ChevronUp, Undo2, Eye, 
  Building2, Users, User, FileCheck, Clock, UserPlus, Zap, FastForward,
  ArrowUpDown, ArrowUp, ArrowDown
} from 'lucide-react';
import { AuditKpiAssignPopover } from '@/components/review/AuditKpiAssignPopover';
import type { AuditKpiAssignment } from '@/hooks/useAuditKpiAssignments';

// Stage-to-column mapping: workflow stage name -> score column definition
const STAGE_COLUMN_MAP: Record<string, { key: string; label: string }> = {
  self_review: { key: 'self_score', label: 'Self' },
  manager_check: { key: 'manager_score', label: 'Manager' },
  skip_level_check: { key: 'skip_level_score', label: 'Skip-Level' },
  hr_pms_review: { key: 'hr_pms_score', label: 'HR PMS' },
  audit: { key: 'auditor_score', label: 'Auditor' },
  management_review: { key: 'management_score', label: 'Mgmt' },
};

// Reverse mapping: column key -> workflow stage name
const COLUMN_TO_STAGE: Record<string, string> = {
  self_score: 'self_review',
  manager_score: 'manager_check',
  skip_level_score: 'skip_level_check',
  hr_pms_score: 'hr_pms_review',
  auditor_score: 'audit',
  management_score: 'management_review',
};

/** Check if a stage has been completed (KPI status has progressed past it) */
function isStageCompleted(columnKey: string, kpiStatus: string, stages: string[]): boolean {
  const stageName = COLUMN_TO_STAGE[columnKey];
  if (!stageName) return false;
  const stageIdx = stages.indexOf(stageName);
  const statusIdx = stages.indexOf(kpiStatus);
  if (stageIdx === -1 || statusIdx === -1) return false;
  return statusIdx > stageIdx;
}

/** Check if a stage is at or before the current status (i.e. the stage has been reached) */
function isStageAtOrBeforeCurrent(columnKey: string, kpiStatus: string, stages: string[]): boolean {
  const stageName = COLUMN_TO_STAGE[columnKey];
  if (!stageName) return false;
  const stageIdx = stages.indexOf(stageName);
  const statusIdx = stages.indexOf(kpiStatus);
  if (stageIdx === -1 || statusIdx === -1) return false;
  return stageIdx <= statusIdx;
}

/** Build dynamic score columns from workflow stages. Final is always appended. */
function buildScoreColumns(stages: string[]): { key: string; label: string }[] {
  const cols: { key: string; label: string }[] = [];
  for (const stage of stages) {
    const col = STAGE_COLUMN_MAP[stage];
    if (col) cols.push(col);
  }
  // Always append Final
  cols.push({ key: 'final_score', label: 'Final' });
  return cols;
}

export type KpiTableViewType = 'my-kpis' | 'team-review' | 'audit' | 'management' | 'skip-level-review' | 'hr-pms-review';

interface KpiDetailsTableProps {
  kpis: KPI[];
  submissionMap: Map<string, ReviewSubmission>;
  queryMap?: Map<string, KpiQuery[]>;
  viewType: KpiTableViewType;
  selectedPeriod: string;
  selectedYear: number;
  onReview?: (kpi: KPI) => void;
  onView?: (kpi: KPI) => void;
  onSendBack?: (kpi: KPI) => void;
  onShowLogic?: (kpi: KPI) => void;
  expandedKpis?: Set<string>;
  onToggleExpand?: (kpiId: string) => void;
  getOrgKpiValue?: (kpi: KPI) => { achieved_value: number | null; data_source: string | null; entered_by_name: string | null } | null;
  getDailyAggregatedScore?: (kpi: KPI) => number | null;
  isKpiLocked?: (kpi: KPI) => boolean;
  workflowStages?: string[];
  sentBackKpiIds?: Set<string>;
  auditKpiAssignments?: Map<string, AuditKpiAssignment>;
  dataOwnerNames?: Map<string, string[]>;
  observationCounts?: Map<string, number>;
}

/**
 * Render a score cell as single digit (1-5), no denominator
 */
function renderScoreCell(score: number | null | undefined): React.ReactNode {
  if (score === null || score === undefined) {
    return <span className="text-muted-foreground">—</span>;
  }
  return <span className="font-medium">{score}</span>;
}

/**
 * Get the score value for a specific column from submission
 */
function getScoreForColumn(
  submission: ReviewSubmission | undefined,
  columnKey: string,
  kpiStatus?: string
): number | null {
  if (!submission) return null;
  
  switch (columnKey) {
    case 'self_score':
      return submission.self_score ?? null;
    case 'manager_score':
      return submission.manager_score ?? null;
    case 'skip_level_score':
      return submission.skip_level_score ?? null;
    case 'hr_pms_score':
      return submission.hr_pms_score ?? null;
    case 'auditor_score':
      return submission.auditor_score ?? null;
    case 'management_score':
      return submission.management_score ?? null;
    case 'final_score':
      // Only show final_score when KPI is approved to prevent stale values
      return kpiStatus === 'approved' ? (submission.final_score ?? null) : null;
    default:
      return null;
  }
}

// Canonical status order for sorting
const STATUS_ORDER: string[] = [
  'kra_set', 'self_review', 'manager_check', 'skip_level_check',
  'hr_pms_review', 'audit', 'management_review', 'approved',
];

type SortField = 'category' | 'weightage' | 'status' | string; // string for dynamic score column keys
type SortDirection = 'asc' | 'desc';

export function KpiDetailsTable({
  kpis,
  submissionMap,
  queryMap,
  viewType,
  selectedPeriod,
  selectedYear,
  onReview,
  onView,
  onSendBack,
  onShowLogic,
  expandedKpis = new Set(),
  onToggleExpand,
  getOrgKpiValue,
  getDailyAggregatedScore,
  isKpiLocked,
  workflowStages,
  sentBackKpiIds,
  auditKpiAssignments,
  dataOwnerNames,
  observationCounts,
}: KpiDetailsTableProps) {
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');

  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const scoreColumns = buildScoreColumns(effectiveStages);
  const totalColumns = 5 + scoreColumns.length + 2;

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(prev => prev === 'desc' ? 'asc' : 'desc');
    } else {
      setSortField(field);
      setSortDirection('desc');
    }
  };

  const getSortIcon = (field: SortField) => {
    if (sortField !== field) return <ArrowUpDown className="h-3 w-3 text-muted-foreground" />;
    return sortDirection === 'asc'
      ? <ArrowUp className="h-3 w-3" />
      : <ArrowDown className="h-3 w-3" />;
  };

  const sortedKpis = useMemo(() => {
    if (!sortField) return kpis;
    return [...kpis].sort((a, b) => {
      const dir = sortDirection === 'asc' ? 1 : -1;

      if (sortField === 'category') {
        const catA = a.kra_categories?.name?.toLowerCase() || '';
        const catB = b.kra_categories?.name?.toLowerCase() || '';
        return catA.localeCompare(catB) * dir;
      }

      if (sortField === 'weightage') {
        return ((a.weightage || 0) - (b.weightage || 0)) * dir;
      }

      if (sortField === 'status') {
        const idxA = STATUS_ORDER.indexOf(a.status || 'kra_set');
        const idxB = STATUS_ORDER.indexOf(b.status || 'kra_set');
        return (idxA - idxB) * dir;
      }

      // Score columns (self_score, manager_score, etc.)
      const subA = submissionMap.get(a.id);
      const subB = submissionMap.get(b.id);
      const scoreA = getScoreForColumn(subA, sortField, a.status || 'kra_set') ?? -Infinity;
      const scoreB = getScoreForColumn(subB, sortField, b.status || 'kra_set') ?? -Infinity;
      return (scoreA - scoreB) * dir;
    });
  }, [kpis, sortField, sortDirection, submissionMap]);
  
  const canReviewKpiCheck = (kpi: KPI): boolean => {
    // N/A KPIs are still reviewable — the reviewer decides whether to confirm or override N/A
    return workflowCanReview(kpi.status || 'kra_set', viewType, effectiveStages);
  };

  const getActionButton = (kpi: KPI): React.ReactNode => {
    const submission = submissionMap.get(kpi.id);
    const isNaKpi = submission?.is_na || false;
    const isDailyKpi = kpi.frequency === 'Daily';
    const isExpanded = expandedKpis.has(kpi.id);
    const locked = isKpiLocked?.(kpi) || false;
    
    // Status-based completion states
    const isApproved = kpi.status === 'approved';
    const isForwarded = viewType === 'audit' && (kpi.status === 'management_review' || kpi.status === 'approved');
    const isTeamReviewPastStage = (viewType === 'team-review' || viewType === 'skip-level-review' || viewType === 'hr-pms-review') && 
      ['manager_check', 'skip_level_check', 'hr_pms_review', 'audit', 'management_review', 'approved'].includes(kpi.status || '');
    
    if (locked && viewType === 'my-kpis') {
      return (
        <Badge variant="outline" className="h-8 px-3 flex items-center gap-1 text-muted-foreground">
          <Lock className="h-3.5 w-3.5" />
          Locked
        </Badge>
      );
    }
    
    return (
      <div className="flex items-center gap-1">
        {canReviewKpiCheck(kpi) ? (
          <>
            {/* Drafted indicator for management view */}
            {viewType === 'management' && kpi.status === 'management_review' && submission?.management_score != null && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 text-[10px]">
                <Clock className="h-3 w-3 mr-0.5" />
                Drafted
              </Badge>
            )}
            <Button size="sm" onClick={() => onReview?.(kpi)}>
              {viewType === 'audit' && kpi.status === 'audit' ? 'Continue' : 'Review'}
            </Button>
            {(viewType === 'team-review' || viewType === 'audit' || viewType === 'management' || viewType === 'skip-level-review' || viewType === 'hr-pms-review') && onSendBack && (
              <Button size="sm" variant="outline" onClick={() => onSendBack(kpi)}>
                <Undo2 className="h-3 w-3" />
              </Button>
            )}
          </>
        ) : isApproved && viewType === 'management' ? (
          <>
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Completed
            </Badge>
            {onView && (
              <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View KPI Details">
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : isForwarded ? (
          <>
            <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Forwarded
            </Badge>
            {onView && (
              <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View KPI Details">
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : (
          // Check if KPI is drafted at management level before showing "Reviewed"
          (viewType === 'team-review' || viewType === 'skip-level-review' || viewType === 'hr-pms-review') && 
          kpi.status === 'management_review' && 
          submission?.management_score !== null && submission?.management_score !== undefined
        ) ? (
          <>
            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300">
              <Clock className="h-3 w-3 mr-1" />
              Draft (Mgmt)
            </Badge>
            {onView && (
              <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View KPI Details">
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : isTeamReviewPastStage ? (
          <>
            <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400">
              <CheckCircle2 className="h-3 w-3 mr-1" />
              Reviewed
            </Badge>
            {onView && (
              <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View KPI Details">
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </>
        ) : isNaKpi ? (
          <div className="flex items-center gap-1">
            <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300">
              N/A
              {(submission as any)?.na_marked_by_role && (
                <span className="ml-1 text-xs opacity-75">
                  ({(submission as any).na_marked_by_role === 'employee' ? 'Self' : 
                    (submission as any).na_marked_by_role.charAt(0).toUpperCase() + (submission as any).na_marked_by_role.slice(1).replace('_', ' ')})
                </span>
              )}
            </Badge>
            {onView && (
              <Button size="sm" variant="ghost" onClick={() => onView(kpi)} title="View N/A Details">
                <Eye className="h-4 w-4" />
              </Button>
            )}
          </div>
        ) : onView ? (
          <Button size="sm" variant="outline" onClick={() => onView(kpi)}>
            <Eye className="h-4 w-4 mr-1" />
            View
          </Button>
        ) : null}
        
        {isDailyKpi && !isNaKpi && onToggleExpand && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onToggleExpand(kpi.id)}
            className="h-8 px-2"
            title={isExpanded ? "Hide daily submissions" : "Show daily submissions"}
          >
            <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
            {isExpanded ? (
              <ChevronUp className="h-3 w-3 ml-0.5" />
            ) : (
              <ChevronDown className="h-3 w-3 ml-0.5" />
            )}
          </Button>
        )}
      </div>
    );
  };

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>
            <button onClick={() => handleSort('category')} className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
              Category {getSortIcon('category')}
            </button>
          </TableHead>
          <TableHead>KRA / KPI</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>
            <button onClick={() => handleSort('weightage')} className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
              Weightage {getSortIcon('weightage')}
            </button>
          </TableHead>
          <TableHead>Achieved</TableHead>
          {scoreColumns.map(col => (
            <TableHead key={col.key} className="text-center">
              <button onClick={() => handleSort(col.key)} className="flex items-center gap-1 justify-center hover:text-foreground transition-colors cursor-pointer w-full">
                {col.label} {getSortIcon(col.key)}
              </button>
            </TableHead>
          ))}
          <TableHead>
            <button onClick={() => handleSort('status')} className="flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
              Status {getSortIcon('status')}
            </button>
          </TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {sortedKpis.map((kpi, index) => {
          const submission = submissionMap.get(kpi.id);
          const kpiQueries = queryMap?.get(kpi.id) || [];
          const openQueries = kpiQueries.filter((q: KpiQuery) => q.status === 'open');
          const isNaKpi = submission?.is_na || false;
          const isDailyKpi = kpi.frequency === 'Daily';
          const isExpanded = expandedKpis.has(kpi.id);
          const locked = isKpiLocked?.(kpi) || false;
          
          // Org-level display
          const orgValue = getOrgKpiValue?.(kpi);
          const scope = kpi.org_level_scope || 'employee';
          
          return (
            <React.Fragment key={kpi.id}>
              <TableRow 
                className={`${index % 2 === 0 ? 'bg-background' : 'bg-muted/20'} ${locked ? 'opacity-60' : ''} ${isNaKpi ? 'opacity-60 bg-muted/20' : ''}`}
              >
                {/* Category */}
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div
                      className="w-3 h-3 rounded-full shrink-0"
                      style={{ backgroundColor: kpi.kra_categories?.color || '#6B7280' }}
                    />
                    <span className="text-sm break-words">
                      {kpi.kra_categories?.name || 'Uncategorized'}
                    </span>
                    {kpi.is_org_level && (
                      <Tooltip>
                        <TooltipTrigger>
                          {scope === 'organization' ? (
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                          ) : scope === 'department' ? (
                            <Users className="h-3 w-3 text-muted-foreground" />
                          ) : (
                            <User className="h-3 w-3 text-muted-foreground" />
                          )}
                        </TooltipTrigger>
                        <TooltipContent>
                          <p>Organization-level KPI ({scope} scope)</p>
                          {orgValue?.data_source && <p className="text-xs">Source: {orgValue.data_source}</p>}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </TableCell>
                
                {/* KRA / KPI */}
                <TableCell>
                  <button
                    onClick={() => onShowLogic?.(kpi)}
                    className="text-left hover:bg-muted/50 p-1 -m-1 rounded transition-colors cursor-pointer group w-full"
                    title="Click to view KPI details"
                  >
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-primary group-hover:underline whitespace-pre-wrap">{renderBoldKpiText(kpi.kra_name)}</p>
                      {isDailyKpi && <DailyBadge />}
                      {kpi.frequency === 'Bi-Monthly' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-violet-300 text-violet-700 dark:border-violet-600 dark:text-violet-400">
                          Bi-Monthly
                        </Badge>
                      )}
                      {kpi.frequency === 'Quarterly' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-teal-300 text-teal-700 dark:border-teal-600 dark:text-teal-400">
                          Quarterly
                        </Badge>
                      )}
                      {sentBackKpiIds?.has(kpi.id) && kpi.status === 'audit' && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-400 gap-0.5">
                          <Undo2 className="h-2.5 w-2.5" />
                          Sent Back
                        </Badge>
                      )}
                      {/* Show Sent Back badge for KPIs at kra_set that have a prior submission */}
                      {kpi.status === 'kra_set' && submission && (
                        <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-4 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-400 gap-0.5">
                          <Undo2 className="h-2.5 w-2.5" />
                          Sent Back
                        </Badge>
                      )}
                      {submission?.auto_advance_reason?.startsWith('System-forwarded') ? (
                        <Tooltip>
                          <TooltipTrigger>
                            <FastForward className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0" />
                          </TooltipTrigger>
                          <TooltipContent>
                            <p className="text-xs">{submission.auto_advance_reason}</p>
                          </TooltipContent>
                        </Tooltip>
                      ) : submission?.auto_advance_reason ? (
                        <Zap className="h-4 w-4 text-orange-500 dark:text-orange-400 shrink-0" />
                      ) : null}
                    </div>
                    <div className="relative">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {renderBoldKpiText(getKpiSummaryText(kpi.kpi_name))}
                      </p>
                      <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0" />
                    </div>
                  </button>
                  {kpi.is_org_level && (
                    <div className="flex flex-wrap items-center gap-1 mt-1.5">
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
                        {scope === 'organization' ? (
                          <Building2 className="h-2.5 w-2.5" />
                        ) : scope === 'department' ? (
                          <Users className="h-2.5 w-2.5" />
                        ) : (
                          <User className="h-2.5 w-2.5" />
                        )}
                        Org KPI — {scope.charAt(0).toUpperCase() + scope.slice(1)}
                      </Badge>
                      {(() => {
                        const ownerKey = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}`;
                        const owners = dataOwnerNames?.get(ownerKey);
                        return owners && owners.length > 0 ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Data Owner: {owners.join(', ')}
                          </Badge>
                        ) : orgValue?.entered_by_name ? (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                            Data Owner: {orgValue.entered_by_name}
                          </Badge>
                        ) : null;
                      })()}
                    </div>
                  )}
                </TableCell>
                
                {/* Target */}
                <TableCell>
                  <span className="font-mono text-sm">{kpi.target_value ?? '-'}</span>
                  {kpi.uom && (
                    <span className="text-xs text-muted-foreground ml-1">{kpi.uom}</span>
                  )}
                </TableCell>
                
                {/* Weightage */}
                <TableCell>
                  <span className="text-sm">{kpi.weightage ?? 0}%</span>
                </TableCell>
                {/* Achieved Value */}
                <TableCell>
                  {(() => {
                    const achievedVal = orgValue?.achieved_value ?? submission?.achieved_value ?? null;
                    if (achievedVal === null || achievedVal === undefined) {
                      return <span className="text-muted-foreground">—</span>;
                    }
                    return (
                      <span className="font-mono text-sm">
                        {achievedVal}
                        {kpi.uom && <span className="text-xs text-muted-foreground ml-1">{kpi.uom}</span>}
                      </span>
                    );
                  })()}
                </TableCell>
                {/* Dynamic Score Columns */}
                {scoreColumns.map(col => {
                  const score = getScoreForColumn(submission, col.key, kpi.status || 'kra_set');
                  const stageCompleted = isStageCompleted(col.key, kpi.status || 'kra_set', effectiveStages);
                  const stageReached = isStageAtOrBeforeCurrent(col.key, kpi.status || 'kra_set', effectiveStages);
                  
                  // For N/A KPIs: Final column shows "N/A" badge; other score columns show dimmed residual scores
                  if (isNaKpi && col.key === 'final_score') {
                    return (
                      <TableCell key={col.key} className="text-center">
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 text-xs">
                          N/A
                        </Badge>
                      </TableCell>
                    );
                  }
                  
                  // For N/A KPIs: show residual scores with strikethrough to indicate they're not counted
                  if (isNaKpi && score !== null) {
                    return (
                      <TableCell key={col.key} className="text-center">
                        <span className="line-through text-muted-foreground/50 text-sm">{score}</span>
                      </TableCell>
                    );
                  }
                  
                  // Show N/A if: (1) stage completed with no score, OR (2) KPI is marked N/A, no score, and stage has been reached
                  const showNA = score === null && (stageCompleted || (submission?.is_na && stageReached));
                   // Show "Re-review" indicator ONLY when score is null, KPI is AT that stage,
                   // AND a later stage already has a score (evidence of rollback per POLICY §33).
                   // Without a downstream score, the null simply means the stage is pending.
                   const stageName = COLUMN_TO_STAGE[col.key];
                   const isAtCurrentStage = stageName === (kpi.status || 'kra_set');
                   const SCORE_COLS_ORDERED = ['self_score', 'manager_score', 'skip_level_score', 'hr_pms_score', 'auditor_score', 'management_score'];
                   const currentColIdx = SCORE_COLS_ORDERED.indexOf(col.key);
                   const hasDownstreamScore = currentColIdx >= 0 && SCORE_COLS_ORDERED.slice(currentColIdx + 1).some(laterCol => {
                     const laterScore = submission?.[laterCol as keyof typeof submission];
                     return laterScore !== null && laterScore !== undefined;
                   });
                   const showReReview = score === null && isAtCurrentStage && !showNA && col.key !== 'self_score' && hasDownstreamScore;
                  return (
                    <TableCell key={col.key} className="text-center">
                      {showNA ? (
                        <Badge variant="outline" className="bg-muted/50 text-muted-foreground text-xs">N/A</Badge>
                      ) : showReReview ? (
                        <Badge variant="outline" className="border-amber-400 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-950 dark:text-amber-300 text-xs">
                          Re-review
                        </Badge>
                      ) : (
                        renderScoreCell(score)
                      )}
                    </TableCell>
                  );
                })}
                
                {/* Status */}
                <TableCell>
                  <div className="flex items-center gap-1 flex-wrap">
                    {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    <Badge className={statusColors[kpi.status || 'kra_set']}>
                      {statusLabels[kpi.status || 'kra_set']}
                    </Badge>
                    {openQueries.length > 0 && (
                      <Badge variant="destructive" className="ml-1">
                        {openQueries.length} query
                      </Badge>
                    )}
                    {viewType === 'audit' && (
                      <AuditKpiAssignPopover
                        kpiId={kpi.id}
                        currentAssignment={auditKpiAssignments?.get(kpi.id) || null}
                      />
                    )}
                    {(() => {
                      const obsCount = observationCounts?.get(kpi.id) || 0;
                      return obsCount > 0 ? (
                        <span className="ml-1 inline-flex items-center gap-0.5 text-xs text-amber-600 dark:text-amber-400">
                          <Eye className="h-3 w-3" />{obsCount}
                        </span>
                      ) : null;
                    })()}
                  </div>
                </TableCell>
                
                {/* Actions */}
                <TableCell>
                  {getActionButton(kpi)}
                </TableCell>
              </TableRow>
              
              {/* Expandable Daily Summary Row */}
              {isDailyKpi && isExpanded && !isNaKpi && (
                <InlineDailySubmissionRow
                  kpi={kpi}
                  selectedPeriod={selectedPeriod}
                  selectedYear={selectedYear}
                  colSpan={totalColumns}
                />
              )}
            </React.Fragment>
          );
        })}
        
        {sortedKpis.length === 0 && (
          <TableRow>
            <TableCell colSpan={totalColumns} className="text-center py-8 text-muted-foreground">
              No KPIs found for this period
            </TableCell>
          </TableRow>
        )}
      </TableBody>
    </Table>
  );
}
