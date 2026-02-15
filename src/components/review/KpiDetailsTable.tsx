/**
 * Unified KPI Details Table Component
 * Displays KPIs with dynamic score columns based on status progression
 * Used across My KPIs, Team Review, Audit, and Management views
 */

import React from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KPI, ReviewSubmission, KpiQuery, ReviewStatus } from '@/hooks/useKpis';
import { InlineDailySubmissionRow } from '@/components/review/InlineDailySubmissionRow';
import { DailyBadge } from '@/components/review/DailyKpiExpandButton';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { canReviewKpi as workflowCanReview, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { 
  Info, Lock, CheckCircle2, Calendar, ChevronDown, ChevronUp, Undo2, Eye, 
  Building2, Users, User, FileCheck, Clock
} from 'lucide-react';

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
  return statusIdx >= stageIdx;
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
  getOrgKpiValue?: (kpi: KPI) => { achieved_value: number | null; data_source: string | null } | null;
  getDailyAggregatedScore?: (kpi: KPI) => number | null;
  isKpiLocked?: (kpi: KPI) => boolean;
  workflowStages?: string[];
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
  columnKey: string
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
      return submission.final_score ?? null;
    default:
      return null;
  }
}

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
}: KpiDetailsTableProps) {
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const scoreColumns = buildScoreColumns(effectiveStages);
  const totalColumns = 4 + scoreColumns.length + 2; // Category, KRA/KPI, Target, Weightage + scores + Status, Actions
  
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
          <TableHead>Category</TableHead>
          <TableHead>KRA / KPI</TableHead>
          <TableHead>Target</TableHead>
          <TableHead>Weightage</TableHead>
          {scoreColumns.map(col => (
            <TableHead key={col.key} className="text-center">{col.label}</TableHead>
          ))}
          <TableHead>Status</TableHead>
          <TableHead>Actions</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {kpis.map((kpi, index) => {
          const submission = submissionMap.get(kpi.id);
          const kpiQueries = queryMap?.get(kpi.id) || [];
          const openQueries = kpiQueries.filter((q: KpiQuery) => q.status === 'open');
          const isNaKpi = submission?.is_na || false;
          const isDailyKpi = kpi.frequency === 'Daily';
          const isExpanded = expandedKpis.has(kpi.id);
          const locked = isKpiLocked?.(kpi) || false;
          
          // Org-level display
          const orgValue = getOrgKpiValue?.(kpi);
          const scope = kpi.org_level_scope || 'organization';
          
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
                    </div>
                    <div className="relative">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">
                        {renderBoldKpiText(kpi.kpi_name)}
                      </p>
                      <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity absolute top-0 right-0" />
                    </div>
                  </button>
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
                {/* Dynamic Score Columns */}
                {scoreColumns.map(col => {
                  const score = getScoreForColumn(submission, col.key);
                  const stageCompleted = isStageCompleted(col.key, kpi.status || 'kra_set', effectiveStages);
                  const showNA = score === null && stageCompleted;
                  return (
              <TableCell key={col.key} className="text-center">
                      {showNA ? (
                        <Badge variant="outline" className="bg-muted/50 text-muted-foreground text-xs">N/A</Badge>
                      ) : (
                        renderScoreCell(score)
                      )}
                    </TableCell>
                  );
                })}
                
                {/* Status */}
                <TableCell>
                  <div className="flex items-center gap-1">
                    {locked && <Lock className="h-3 w-3 text-muted-foreground" />}
                    <Badge className={statusColors[kpi.status || 'kra_set']}>
                      {statusLabels[kpi.status || 'kra_set']}
                    </Badge>
                    {openQueries.length > 0 && (
                      <Badge variant="destructive" className="ml-1">
                        {openQueries.length} query
                      </Badge>
                    )}
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
        
        {kpis.length === 0 && (
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
