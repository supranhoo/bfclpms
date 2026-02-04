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
import { normalizeKpiText } from '@/lib/textFormatting';
import { 
  Info, Lock, CheckCircle2, Calendar, ChevronDown, ChevronUp, Undo2, Eye, 
  Building2, Users, User, FileCheck
} from 'lucide-react';

// Status progression order for determining visible columns
const STATUS_ORDER: ReviewStatus[] = [
  'kra_set',
  'self_review',
  'manager_check',
  'audit',
  'management_review',
  'approved'
];

export type KpiTableViewType = 'my-kpis' | 'team-review' | 'audit' | 'management';

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
  // For org-level KPIs
  getOrgKpiValue?: (kpi: KPI) => { achieved_value: number | null; data_source: string | null } | null;
  // For daily aggregated scores
  getDailyAggregatedScore?: (kpi: KPI) => number | null;
  // For locked KPI detection
  isKpiLocked?: (kpi: KPI) => boolean;
}

/**
 * Determine which score columns should be visible based on KPI status
 */
function getVisibleScoreColumns(status: ReviewStatus | string): { key: string; label: string }[] {
  const statusIndex = STATUS_ORDER.indexOf(status as ReviewStatus);
  
  const columns: { key: string; label: string; minStatusIndex: number }[] = [
    { key: 'self_score', label: 'Self', minStatusIndex: 0 },
    { key: 'manager_score', label: 'Manager', minStatusIndex: 1 }, // >= self_review
    { key: 'auditor_score', label: 'Auditor', minStatusIndex: 2 }, // >= manager_check
    { key: 'management_score', label: 'Mgmt', minStatusIndex: 4 },  // >= management_review
  ];
  
  return columns
    .filter(col => statusIndex >= col.minStatusIndex)
    .map(({ key, label }) => ({ key, label }));
}

/**
 * Get the maximum visible columns across all KPIs in the table
 */
function getMaxVisibleColumns(kpis: KPI[]): { key: string; label: string }[] {
  let maxColumns: { key: string; label: string }[] = [];
  
  for (const kpi of kpis) {
    const cols = getVisibleScoreColumns(kpi.status);
    if (cols.length > maxColumns.length) {
      maxColumns = cols;
    }
  }
  
  // Default to at least Self column
  return maxColumns.length > 0 ? maxColumns : [{ key: 'self_score', label: 'Self' }];
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
      // Use self_score (1-5 rating), NOT achieved_value
      return submission.self_score ?? null;
    case 'manager_score':
      return submission.manager_score ?? null;
    case 'auditor_score':
      return submission.auditor_score ?? null;
    case 'management_score':
      return submission.management_score ?? null;
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
}: KpiDetailsTableProps) {
  // Calculate max visible columns across all KPIs
  const visibleColumns = getMaxVisibleColumns(kpis);
  const totalColumns = 4 + visibleColumns.length + 2; // Category, KRA/KPI, Target, [scores...], Status, Actions
  
  const canReviewKpi = (kpi: KPI): boolean => {
    const submission = submissionMap.get(kpi.id);
    const isNaKpi = submission?.is_na || false;
    if (isNaKpi) return false;
    
    switch (viewType) {
      case 'my-kpis':
        return kpi.status === 'kra_set';
      case 'team-review':
        return kpi.status === 'self_review';
      case 'audit':
        return kpi.status === 'manager_check' || kpi.status === 'audit';
      case 'management':
        return kpi.status === 'management_review';
      default:
        return false;
    }
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
    const isTeamReviewPastStage = viewType === 'team-review' && 
      ['manager_check', 'audit', 'management_review', 'approved'].includes(kpi.status || '');
    
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
        {canReviewKpi(kpi) ? (
          <>
            <Button size="sm" onClick={() => onReview?.(kpi)}>
              {viewType === 'audit' && kpi.status === 'audit' ? 'Continue' : 'Review'}
            </Button>
            {(viewType === 'team-review' || viewType === 'audit' || viewType === 'management') && onSendBack && (
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
          <Badge variant="outline" className="bg-muted text-muted-foreground">
            Not Applicable
          </Badge>
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
          {visibleColumns.map(col => (
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
                    <span className="text-sm truncate max-w-[100px]">
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
                      <p className="font-medium text-primary group-hover:underline whitespace-pre-wrap">{normalizeKpiText(kpi.kra_name)}</p>
                      {isDailyKpi && <DailyBadge />}
                    </div>
                    <p className="text-sm text-muted-foreground flex items-center gap-1 whitespace-pre-wrap">
                      {normalizeKpiText(kpi.kpi_name)}
                      <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0" />
                    </p>
                  </button>
                </TableCell>
                
                {/* Target */}
                <TableCell>
                  <span className="font-mono text-sm">{kpi.target_value ?? '-'}</span>
                  {kpi.uom && (
                    <span className="text-xs text-muted-foreground ml-1">{kpi.uom}</span>
                  )}
                </TableCell>
                
                {/* Dynamic Score Columns */}
                {visibleColumns.map(col => {
                  const score = getScoreForColumn(submission, col.key);
                  return (
              <TableCell key={col.key} className="text-center">
                      {isNaKpi ? (
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
