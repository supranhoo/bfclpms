import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { OrgKpiFileUpload } from '@/components/admin/OrgKpiFileUpload';
import { isValueOutOfRange, RatingThresholds, calculateRating } from '@/lib/ratingCalculation';
import { RatingBadge } from '@/components/ui/RatingBadge';
import { QualitativeSelect } from '@/components/review/QualitativeSelect';
import { BINARY_OPTIONS, type QualitativeOption } from '@/lib/qualitativeUom';
import { ChevronDown, ChevronRight, Building2, AlertTriangle, Ban, TrendingUp, TrendingDown, MessageSquare, ArrowUpRight, Undo2, CheckCircle2, Clock } from 'lucide-react';
import { format } from 'date-fns';
import type { KpiObservation } from '@/hooks/useKpiObservations';
import type { ComplianceSubFactors } from '@/hooks/useComplianceSubFactors';
import type { SentBackInfo } from '@/hooks/useSentBackOrgKpiEmployees';

export interface ScopedRow {
  scopeId: string;
  scopeName: string;
  scopeSubText?: string;
  departmentName?: string;
  designation?: string;
  achievedValue: number | null;
  remarks: string;
  evidenceUrl: string | null;
  isNa?: boolean;
  targetValue?: number | null;
  uom?: string | null;
  uomType?: 'numeric' | 'binary' | 'tiered' | null;
  qualitativeOptions?: Array<{ label: string; rating: number; definition: string }> | null;
  subFactors?: ComplianceSubFactors | null;
  /**
   * Per-row OKV status — drives the inline pill so admins can tell at a glance
   * which rows have been propagated to employee scorecards and which still
   * need the Propagate action. Defaults to 'pending' when omitted.
   */
  status?: 'pending' | 'entered' | 'propagated' | 'approved';
}

export interface ObservationCounts {
  positive: number;
  concern: number;
  neutral: number;
}

interface OrgKpiScopedEntryTableProps {
  rows: ScopedRow[];
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa' | 'subFactors', value: string | null) => void;
  scopeLabel: string;
  ratingThresholds?: RatingThresholds;
  targetValue?: number | null;
  uom?: string | null;
  criteria?: string;
  /** Full observations grouped by employee ID */
  employeeObservations?: Map<string, KpiObservation[]>;
  /** @deprecated Use employeeObservations instead */
  observationCounts?: Map<string, ObservationCounts>;
  /** Sent-back status per employee */
  sentBackMap?: Map<string, SentBackInfo>;
  /** Selected scope IDs for multi-select propagation */
  selectedIds?: string[];
  /** Selection change callback */
  onSelectionChange?: (ids: string[]) => void;
  /** Per-row propagate callback */
  onPropagateRow?: (scopeId: string) => void;
  /** Whether propagation is in progress */
  isPropagating?: boolean;
  /** Whether this is the compliance KPI (shows sub-factor columns) */
  isComplianceKpi?: boolean;
  /** Bulk submission date data per employee */
  submissionDates?: Map<string, { complete: boolean; date: string | null; pendingCount: number }>;
  /**
   * Canonical mapped employee count for this KPI (ADR-064). When set and
   * larger than `rows.length`, the header shows "X of Y" so the visible
   * subset cannot be confused with the true mapped total.
   */
  totalCount?: number;
}

export function OrgKpiScopedEntryTable({ rows, onValueChange, scopeLabel, ratingThresholds, targetValue, uom, criteria, employeeObservations, observationCounts, sentBackMap, selectedIds = [], onSelectionChange, onPropagateRow, isPropagating, isComplianceKpi = false, submissionDates, totalCount }: OrgKpiScopedEntryTableProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [bulkFillValue, setBulkFillValue] = useState('');

  const naCount = rows.filter(r => r.isNa).length;
  const allQualitative = rows.length > 0 && rows.every(r => r.uomType === 'binary' || (r.uomType === 'tiered' && r.qualitativeOptions?.length));
  const enteredCount = rows.filter(r => r.achievedValue !== null || r.isNa).length;
  const allEntered = rows.length > 0 && enteredCount === rows.length;
  const sentBackCount = sentBackMap?.size ?? 0;
  const effectiveTotal = typeof totalCount === 'number' && totalCount > rows.length ? totalCount : rows.length;
  const hasHidden = effectiveTotal > rows.length;

  // Per-row propagation breakdown (drives the new "X propagated / Y not" hint
  // next to the entered count).
  const propagatedCount = rows.filter(r => r.status === 'propagated' || r.status === 'approved').length;
  const notPropagatedCount = rows.filter(r => (r.status ?? 'pending') === 'entered').length;
  const showStatusBreakdown = propagatedCount > 0 && notPropagatedCount > 0;

  const hasSelectionFeature = !!onSelectionChange;
  const hasRowPropagation = !!onPropagateRow;
  const showActionsColumn = hasSelectionFeature || hasRowPropagation;

  const isEmployeeScope = scopeLabel === 'Employee';
  const sortedRows = [...rows].sort((a, b) => {
    if (isEmployeeScope) {
      const deptA = a.departmentName ?? '';
      const deptB = b.departmentName ?? '';
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      return a.scopeName.localeCompare(b.scopeName);
    }
    return a.scopeName.localeCompare(b.scopeName);
  });

  const groupedRows: Array<{ dept: string | null; rows: ScopedRow[] }> = [];
  if (isEmployeeScope) {
    for (const row of sortedRows) {
      const dept = row.departmentName ?? null;
      const last = groupedRows[groupedRows.length - 1];
      if (!last || last.dept !== dept) {
        groupedRows.push({ dept, rows: [row] });
      } else {
        last.rows.push(row);
      }
    }
  }

  const handleBulkFill = () => {
    if (!bulkFillValue.trim()) return;
    rows.forEach(r => {
      if (r.achievedValue === null) {
        onValueChange(r.scopeId, 'achievedValue', bulkFillValue);
      }
    });
    setBulkFillValue('');
  };

  const emptyCount = rows.filter(r => r.achievedValue === null && !r.isNa).length;

  // Select all/none
  const allSelected = rows.length > 0 && selectedIds.length === rows.length;
  const someSelected = selectedIds.length > 0 && selectedIds.length < rows.length;

  const handleSelectAll = (checked: boolean) => {
    if (!onSelectionChange) return;
    onSelectionChange(checked ? rows.map(r => r.scopeId) : []);
  };

  const handleToggleRow = (scopeId: string, checked: boolean) => {
    if (!onSelectionChange) return;
    if (checked) {
      onSelectionChange([...selectedIds, scopeId]);
    } else {
      onSelectionChange(selectedIds.filter(id => id !== scopeId));
    }
  };

  const complianceCols = isComplianceKpi ? 4 : 0;
  const totalColSpan = 7 + (hasSelectionFeature ? 1 : 0) + (hasRowPropagation ? 1 : 0) + complianceCols;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2 flex-wrap">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-sm flex-shrink-0">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {effectiveTotal} {scopeLabel}s
            <span className={allEntered ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
              ({enteredCount} / {hasHidden ? `${rows.length} visible` : rows.length} entered{naCount > 0 ? `, ${naCount} N/A` : ''})
            </span>
            {showStatusBreakdown && (
              <span className="flex items-center gap-1.5 text-[11px] font-normal">
                <Badge variant="outline" className="h-4 px-1.5 font-normal border-green-300 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400 gap-0.5">
                  <ArrowUpRight className="w-2.5 h-2.5" />
                  {propagatedCount} propagated
                </Badge>
                <Badge variant="outline" className="h-4 px-1.5 font-normal border-orange-300 bg-orange-50 text-orange-700 dark:border-orange-800 dark:bg-orange-950/30 dark:text-orange-400 gap-0.5">
                  <CheckCircle2 className="w-2.5 h-2.5" />
                  {notPropagatedCount} not propagated
                </Badge>
              </span>
            )}
            {sentBackCount > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400 gap-0.5">
                <Undo2 className="w-2.5 h-2.5" />
                {sentBackCount} sent back
              </Badge>
            )}
          </Button>
        </CollapsibleTrigger>

        {isOpen && emptyCount > 0 && !allQualitative && (
          <div className="flex items-center gap-1 flex-shrink-0">
            <Input
              type="number"
              value={bulkFillValue}
              onChange={e => setBulkFillValue(e.target.value)}
              placeholder="Fill value"
              className="h-7 w-28 text-xs"
              onKeyDown={e => { if (e.key === 'Enter') handleBulkFill(); }}
            />
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              onClick={handleBulkFill}
              disabled={!bulkFillValue.trim()}
            >
              Fill {emptyCount} empty
            </Button>
          </div>
        )}
      </div>

      <CollapsibleContent>
        <div className="border rounded-lg mt-2 min-w-0 overflow-x-auto max-h-[520px] overflow-y-auto">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow className="bg-muted/30">
                {hasSelectionFeature && (
                  <TableHead className="w-10 text-center">
                    <Checkbox
                      checked={allSelected}
                      ref={(el) => {
                        if (el) (el as any).indeterminate = someSelected;
                      }}
                      onCheckedChange={handleSelectAll}
                      className="mx-auto"
                    />
                  </TableHead>
                )}
                <TableHead className="text-xs min-w-[200px]">{scopeLabel}</TableHead>
                <TableHead className="text-xs w-24 text-center">Target</TableHead>
                <TableHead className="text-xs w-16 text-center">N/A</TableHead>
                {isComplianceKpi && (
                  <>
                    <TableHead className="text-xs w-24 text-center">Policy Compliance</TableHead>
                    <TableHead className="text-xs w-36 text-center">Submission Date</TableHead>
                    <TableHead className="text-xs w-24 text-center">Policy Training</TableHead>
                    <TableHead className="text-xs w-24 text-center">Other Obs.</TableHead>
                  </>
                )}
                <TableHead className="text-xs w-28 text-center">Achieved</TableHead>
                <TableHead className="text-xs w-24 text-center">Rating</TableHead>
                <TableHead className="text-xs min-w-[220px]">Remark</TableHead>
                <TableHead className="text-xs w-24">File</TableHead>
                {hasRowPropagation && (
                  <TableHead className="text-xs w-16 text-center">Actions</TableHead>
                )}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmployeeScope ? (
                groupedRows.map(group => (
                  <EmployeeGroup
                    key={`group-${group.dept ?? 'none'}`}
                    group={group}
                    onValueChange={onValueChange}
                    ratingThresholds={ratingThresholds}
                    targetValue={targetValue}
                    uom={uom}
                    criteria={criteria}
                    employeeObservations={employeeObservations}
                    observationCounts={observationCounts}
                    sentBackMap={sentBackMap}
                    selectedIds={selectedIds}
                    onToggleRow={hasSelectionFeature ? handleToggleRow : undefined}
                    onPropagateRow={onPropagateRow}
                    isPropagating={isPropagating}
                    totalColSpan={totalColSpan}
                    hasSelectionFeature={hasSelectionFeature}
                    hasRowPropagation={hasRowPropagation}
                    isComplianceKpi={isComplianceKpi}
                    submissionDates={submissionDates}
                  />
                ))
              ) : (
                sortedRows.map(row => (
                  <DepartmentRow
                    key={row.scopeId}
                    row={row}
                    onValueChange={onValueChange}
                    ratingThresholds={ratingThresholds}
                    targetValue={targetValue}
                    uom={uom}
                    criteria={criteria}
                    sentBackInfo={sentBackMap?.get(row.scopeId)}
                    isSelected={selectedIds.includes(row.scopeId)}
                    onToggleRow={hasSelectionFeature ? handleToggleRow : undefined}
                    onPropagateRow={onPropagateRow}
                    isPropagating={isPropagating}
                    hasSelectionFeature={hasSelectionFeature}
                    hasRowPropagation={hasRowPropagation}
                  />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Employee group (department header + employee rows) ----
interface EmployeeGroupProps {
  group: { dept: string | null; rows: ScopedRow[] };
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa' | 'subFactors', value: string | null) => void;
  ratingThresholds?: RatingThresholds;
  targetValue?: number | null;
  uom?: string | null;
  criteria?: string;
  employeeObservations?: Map<string, KpiObservation[]>;
  observationCounts?: Map<string, ObservationCounts>;
  sentBackMap?: Map<string, SentBackInfo>;
  selectedIds: string[];
  onToggleRow?: (scopeId: string, checked: boolean) => void;
  onPropagateRow?: (scopeId: string) => void;
  isPropagating?: boolean;
  totalColSpan: number;
  hasSelectionFeature: boolean;
  hasRowPropagation: boolean;
  isComplianceKpi?: boolean;
  submissionDates?: Map<string, { complete: boolean; date: string | null; pendingCount: number }>;
}

function EmployeeGroup({ group, onValueChange, ratingThresholds, targetValue, uom, criteria, employeeObservations, observationCounts, sentBackMap, selectedIds, onToggleRow, onPropagateRow, isPropagating, totalColSpan, hasSelectionFeature, hasRowPropagation, isComplianceKpi, submissionDates }: EmployeeGroupProps) {
  return (
    <>
      <TableRow key={`group-${group.dept ?? 'none'}`} className="bg-muted/50 hover:bg-muted/50">
        <TableCell colSpan={totalColSpan} className="py-1.5 px-3">
          <div className="flex items-center gap-2">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs font-semibold text-muted-foreground">
              {group.dept ?? 'No Department'}
            </span>
            <Badge variant="outline" className="text-xs h-4 px-1.5 font-normal">
              {group.rows.length} {group.rows.length === 1 ? 'employee' : 'employees'}
            </Badge>
          </div>
        </TableCell>
      </TableRow>
      {group.rows.map(row => (
        <EmployeeRow
          key={row.scopeId}
          row={row}
          onValueChange={onValueChange}
          ratingThresholds={ratingThresholds}
          targetValue={targetValue}
          uom={uom}
          criteria={criteria}
          observations={employeeObservations?.get(row.scopeId)}
          observationCounts={observationCounts?.get(row.scopeId)}
          sentBackInfo={sentBackMap?.get(row.scopeId)}
          isSelected={selectedIds.includes(row.scopeId)}
          onToggleRow={onToggleRow}
          onPropagateRow={onPropagateRow}
          isPropagating={isPropagating}
          totalColSpan={totalColSpan}
          hasSelectionFeature={hasSelectionFeature}
          hasRowPropagation={hasRowPropagation}
          isComplianceKpi={isComplianceKpi}
          submissionDateInfo={submissionDates?.get(row.scopeId)}
        />
      ))}
    </>
  );
}

// ---- Observation type/status configs (reused from OrgKpiObservationsSummary) ----
const obsTypeConfig: Record<string, { label: string; className: string }> = {
  positive: { label: 'Positive', className: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  concern: { label: 'Concern', className: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  neutral: { label: 'Neutral', className: 'bg-muted text-muted-foreground' },
};

const obsStatusConfig: Record<string, { label: string; variant: 'outline' | 'secondary' | 'default' }> = {
  open: { label: 'Open', variant: 'outline' },
  acknowledged: { label: 'Acknowledged', variant: 'secondary' },
  resolved: { label: 'Resolved', variant: 'default' },
};

// ---- Per-row propagate cell with confirmation dialog ----
function PerRowPropagateCell({ canPropagate, isPropagating, employeeName, onConfirm }: {
  canPropagate: boolean;
  isPropagating?: boolean;
  employeeName: string;
  onConfirm: () => void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);

  return (
    <TableCell className="py-1.5 w-16 text-center">
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              disabled={!canPropagate || isPropagating}
              onClick={() => setConfirmOpen(true)}
            >
              <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Propagate this employee only
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Propagate to Employee Scorecard?</AlertDialogTitle>
            <AlertDialogDescription>
              This will push the Org KPI score for <strong className="text-foreground">{employeeName}</strong> to their individual scorecard. This action will lock this entry from further edits (unless rolled back by an admin).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setConfirmOpen(false); onConfirm(); }}>
              Propagate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TableCell>
  );
}

// ---- Employee row (with expandable observation sub-row) ----
interface EmployeeRowProps {
  row: ScopedRow;
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa' | 'subFactors', value: string | null) => void;
  ratingThresholds?: RatingThresholds;
  targetValue?: number | null;
  uom?: string | null;
  criteria?: string;
  observations?: KpiObservation[];
  observationCounts?: ObservationCounts;
  sentBackInfo?: SentBackInfo;
  isSelected: boolean;
  onToggleRow?: (scopeId: string, checked: boolean) => void;
  onPropagateRow?: (scopeId: string) => void;
  isPropagating?: boolean;
  totalColSpan: number;
  hasSelectionFeature: boolean;
  hasRowPropagation: boolean;
  isComplianceKpi?: boolean;
  submissionDateInfo?: { complete: boolean; date: string | null; pendingCount: number };
}

function EmployeeRow({ row, onValueChange, ratingThresholds, targetValue, uom, criteria, observations, observationCounts: legacyCounts, sentBackInfo, isSelected, onToggleRow, onPropagateRow, isPropagating, totalColSpan, hasSelectionFeature, hasRowPropagation, isComplianceKpi, submissionDateInfo }: EmployeeRowProps) {
  const [expanded, setExpanded] = useState(false);

  const effectiveTarget = row.targetValue != null ? row.targetValue : targetValue;
  const effectiveUom = row.uom != null ? row.uom : uom;

  const numVal = row.achievedValue;
  const outOfRange = numVal !== null && ratingThresholds
    ? isValueOutOfRange(numVal, effectiveTarget ?? null, ratingThresholds, effectiveUom ?? null)
    : null;

  const rowIsNa = row.isNa ?? false;
  const isSentBack = !!sentBackInfo;

  // Derive counts from full observations if available, else fall back to legacy counts
  const counts = observations
    ? {
        positive: observations.filter(o => o.observation_type === 'positive').length,
        concern: observations.filter(o => o.observation_type === 'concern').length,
        neutral: observations.filter(o => o.observation_type === 'neutral').length,
      }
    : legacyCounts;

  const hasObservations = observations && observations.length > 0;
  const totalObs = counts ? counts.positive + counts.concern + counts.neutral : 0;

  const canPropagate = (numVal !== null || rowIsNa) && !isPropagating;

  return (
    <>
      <TableRow className={`${rowIsNa ? 'opacity-60' : ''} ${isSentBack ? 'border-l-2 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/20' : ''}`}>
        {/* Checkbox */}
        {hasSelectionFeature && (
          <TableCell className="py-1.5 w-10 text-center">
            <Checkbox
              checked={isSelected}
              onCheckedChange={(checked) => onToggleRow?.(row.scopeId, !!checked)}
            />
          </TableCell>
        )}

        {/* Name + dept/designation + observation badges + sent-back indicator */}
        <TableCell className="text-sm py-1.5 min-w-[200px]">
          <div className="flex flex-col gap-0.5">
            <span className="font-medium text-sm leading-tight">{row.scopeName}</span>
            <div className="flex flex-wrap gap-1 mt-0.5">
              {row.departmentName && (
                <Badge variant="secondary" className="text-[10px] h-4 px-1.5 font-normal">
                  {row.departmentName}
                </Badge>
              )}
              {row.designation && (
                <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal">
                  {row.designation}
                </Badge>
              )}
              {/* Sent-back indicator */}
              {isSentBack && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400 gap-0.5 cursor-help">
                        <Undo2 className="w-2.5 h-2.5" />
                        Sent Back
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[300px] text-xs">
                      <p className="font-medium">Sent back by {sentBackInfo.senderName}</p>
                      <p className="text-muted-foreground mt-0.5">{sentBackInfo.reason}</p>
                      <p className="text-muted-foreground mt-0.5">{format(new Date(sentBackInfo.date), 'dd MMM yyyy HH:mm')}</p>
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
              {/* Observation badges — clickable when full observations available */}
              {counts && counts.positive > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1.5 font-normal border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400 gap-0.5 ${hasObservations ? 'cursor-pointer hover:bg-green-100 dark:hover:bg-green-950/50 transition-colors' : ''}`}
                  onClick={hasObservations ? () => setExpanded(!expanded) : undefined}
                >
                  <TrendingUp className="w-2.5 h-2.5" />
                  Positive: {counts.positive}
                </Badge>
              )}
              {counts && counts.concern > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1.5 font-normal border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 gap-0.5 ${hasObservations ? 'cursor-pointer hover:bg-red-100 dark:hover:bg-red-950/50 transition-colors' : ''}`}
                  onClick={hasObservations ? () => setExpanded(!expanded) : undefined}
                >
                  <TrendingDown className="w-2.5 h-2.5" />
                  Concern: {counts.concern}
                </Badge>
              )}
              {counts && counts.neutral > 0 && (
                <Badge
                  variant="outline"
                  className={`text-[10px] h-4 px-1.5 font-normal gap-0.5 ${hasObservations ? 'cursor-pointer hover:bg-muted transition-colors' : ''}`}
                  onClick={hasObservations ? () => setExpanded(!expanded) : undefined}
                >
                  Neutral: {counts.neutral}
                </Badge>
              )}
              {/* Show a generic expand toggle if observations exist but all counts are 0 (shouldn't happen, but safe) */}
              {hasObservations && totalObs > 0 && (
                <button
                  onClick={() => setExpanded(!expanded)}
                  className="text-[10px] text-muted-foreground hover:text-foreground transition-colors flex items-center gap-0.5"
                >
                  {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                  {expanded ? 'Hide' : 'View'} details
                </button>
              )}
            </div>
          </div>
        </TableCell>

        {/* Target */}
        <TableCell className="py-1.5 w-24 text-center">
          <span className={`text-xs ${rowIsNa ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
            {effectiveTarget != null ? effectiveTarget : '—'}
            {effectiveUom && effectiveTarget != null && <span className="ml-0.5 text-[10px]">{effectiveUom}</span>}
          </span>
        </TableCell>

        {/* N/A toggle */}
        <TableCell className="py-1.5 w-16 text-center">
          <Switch
            checked={rowIsNa}
            onCheckedChange={(checked) => onValueChange(row.scopeId, 'isNa', checked ? 'true' : 'false')}
            className="scale-75"
          />
        </TableCell>

        {/* Compliance sub-factor columns */}
        {isComplianceKpi && (
          <>
            {/* Policy Compliance */}
            <TableCell className="py-1.5 w-24 text-center">
              {rowIsNa ? <span className="text-xs text-muted-foreground">—</span> : (
                <Select
                  value={row.subFactors?.policy_compliance === true ? 'yes' : row.subFactors?.policy_compliance === false ? 'no' : ''}
                  onValueChange={(val) => {
                    const sf = { ...(row.subFactors || { policy_compliance: null, submission_date: submissionDateInfo?.date ?? null, submission_complete: submissionDateInfo?.complete ?? false, submission_pending_count: submissionDateInfo?.pendingCount ?? 0, policy_training: null, other_observation: null }) };
                    sf.policy_compliance = val === 'yes' ? true : val === 'no' ? false : null;
                    onValueChange(row.scopeId, 'subFactors', JSON.stringify(sf));
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </TableCell>
            {/* Submission Date (auto) */}
            <TableCell className="py-1.5 w-36 text-center">
              {submissionDateInfo ? (
                submissionDateInfo.complete ? (
                  <span className="text-xs text-foreground flex items-center justify-center gap-1">
                    <CheckCircle2 className="h-3 w-3 text-green-600" />
                    {submissionDateInfo.date ? format(new Date(submissionDateInfo.date), 'dd MMM yyyy') : 'Complete'}
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3 text-amber-500" />
                    {submissionDateInfo.pendingCount} KPIs pending
                  </span>
                )
              ) : (
                <span className="text-xs text-muted-foreground">—</span>
              )}
            </TableCell>
            {/* Policy Training */}
            <TableCell className="py-1.5 w-24 text-center">
              {rowIsNa ? <span className="text-xs text-muted-foreground">—</span> : (
                <Select
                  value={row.subFactors?.policy_training === true ? 'yes' : row.subFactors?.policy_training === false ? 'no' : ''}
                  onValueChange={(val) => {
                    const sf = { ...(row.subFactors || { policy_compliance: null, submission_date: submissionDateInfo?.date ?? null, submission_complete: submissionDateInfo?.complete ?? false, submission_pending_count: submissionDateInfo?.pendingCount ?? 0, policy_training: null, other_observation: null }) };
                    sf.policy_training = val === 'yes' ? true : val === 'no' ? false : null;
                    onValueChange(row.scopeId, 'subFactors', JSON.stringify(sf));
                  }}
                >
                  <SelectTrigger className="h-7 text-xs w-full"><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="yes">Yes</SelectItem>
                    <SelectItem value="no">No</SelectItem>
                  </SelectContent>
                </Select>
              )}
            </TableCell>
            {/* Other Observation */}
            <TableCell className="py-1.5 w-24 text-center">
              {rowIsNa ? <span className="text-xs text-muted-foreground">—</span> : (
                <Input
                  type="number"
                  value={row.subFactors?.other_observation ?? ''}
                  onChange={(e) => {
                    const sf = { ...(row.subFactors || { policy_compliance: null, submission_date: submissionDateInfo?.date ?? null, submission_complete: submissionDateInfo?.complete ?? false, submission_pending_count: submissionDateInfo?.pendingCount ?? 0, policy_training: null, other_observation: null }) };
                    sf.other_observation = e.target.value === '' ? null : parseFloat(e.target.value);
                    onValueChange(row.scopeId, 'subFactors', JSON.stringify(sf));
                  }}
                  placeholder="—"
                  className="h-7 text-center text-xs"
                />
              )}
            </TableCell>
          </>
        )}

        {/* Achieved value */}
        <TableCell className="py-1.5 w-28">
          {rowIsNa ? (
            <div className="flex items-center justify-center gap-1 text-muted-foreground">
              <Ban className="h-3.5 w-3.5" />
              <span className="text-xs font-medium">N/A</span>
            </div>
          ) : row.uomType === 'binary' || (row.uomType === 'tiered' && row.qualitativeOptions?.length) ? (
            <QualitativeSelect
              uomType={row.uomType}
              qualitativeOptions={(row.qualitativeOptions as QualitativeOption[]) || null}
              value={(() => {
                const opts = row.qualitativeOptions?.length
                  ? row.qualitativeOptions
                  : (row.uomType === 'binary' ? BINARY_OPTIONS : []);
                if (row.achievedValue === null) return null;
                const match = opts.find(o => Number(o.rating) === row.achievedValue);
                return match?.label || null;
              })()}
              onChange={(label, rating) => {
                onValueChange(row.scopeId, 'achievedValue', rating.toString());
              }}
              className="h-8 w-full text-sm"
            />
          ) : (
            <div className="flex items-center gap-1">
              <Input
                type="number"
                value={row.achievedValue ?? ''}
                onChange={(e) => onValueChange(row.scopeId, 'achievedValue', e.target.value)}
                placeholder="—"
                className="h-8 text-center text-sm flex-1"
              />
              {outOfRange?.outOfRange && (
                <TooltipProvider>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <AlertTriangle className="h-4 w-4 text-orange-500 shrink-0 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent side="top" className="max-w-[220px] text-xs">
                      {outOfRange.message}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              )}
            </div>
          )}
        </TableCell>

        {/* Rating */}
        <TableCell className="py-1.5 w-24 text-center">
          {rowIsNa || numVal === null ? (
            <span className="text-xs text-muted-foreground">—</span>
          ) : (row.uomType === 'binary' || (row.uomType === 'tiered' && row.qualitativeOptions?.length)) ? (
            <RatingBadge score={numVal} short className="text-[10px] h-5 px-1.5" />
          ) : (
            <RatingBadge
              score={calculateRating(
                numVal, effectiveTarget, ratingThresholds || { r5: null, r4: null, r3: null, r2: null, r1: null },
                criteria, 0, 'numeric', null, effectiveUom
              ).rating}
              short
              className="text-[10px] h-5 px-1.5"
            />
          )}
        </TableCell>

        {/* Remark */}
        <TableCell className="py-1.5 min-w-[220px]">
          {rowIsNa ? (
            <Textarea
              value={row.remarks}
              onChange={(e) => onValueChange(row.scopeId, 'remarks', e.target.value)}
              placeholder="Reason for N/A (required)"
              className="text-sm resize-none min-h-0 border-destructive/50"
              rows={2}
              required
            />
          ) : (
            <Textarea
              value={row.remarks}
              onChange={(e) => onValueChange(row.scopeId, 'remarks', e.target.value)}
              placeholder="Remark"
              className="text-sm resize-none min-h-0"
              rows={2}
            />
          )}
        </TableCell>

        {/* File */}
        <TableCell className="py-1.5 w-24">
          {!rowIsNa && (
            <OrgKpiFileUpload
              existingUrl={row.evidenceUrl}
              onUploadComplete={(url) => onValueChange(row.scopeId, 'evidenceUrl', url)}
            />
          )}
        </TableCell>

        {/* Per-row propagate action with confirmation dialog */}
        {hasRowPropagation && (
          <PerRowPropagateCell
            canPropagate={canPropagate}
            isPropagating={isPropagating}
            employeeName={row.scopeName}
            onConfirm={() => onPropagateRow?.(row.scopeId)}
          />
        )}
      </TableRow>

      {/* Expandable observation detail sub-row */}
      {expanded && hasObservations && (
        <TableRow className="bg-muted/20 hover:bg-muted/20">
          <TableCell colSpan={totalColSpan} className="py-2 px-3">
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {observations!.map(obs => {
                const type = obsTypeConfig[obs.observation_type] || obsTypeConfig.neutral;
                const status = obsStatusConfig[obs.status] || obsStatusConfig.open;
                return (
                  <div key={obs.id} className="flex items-start gap-2 text-xs bg-background/60 border rounded-md p-2">
                    <MessageSquare className="h-3.5 w-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="flex-1 min-w-0 space-y-0.5">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${type.className}`}>
                          {type.label}
                        </span>
                        <Badge variant={status.variant} className="text-[10px] h-4 px-1.5">
                          {status.label}
                        </Badge>
                        {(obs as any).ticket_number && (
                          <span className="text-muted-foreground">{(obs as any).ticket_number}</span>
                        )}
                        {obs.created_by_profile && (
                          <span className="text-muted-foreground">
                            · Raised by: {obs.created_by_profile.full_name || obs.created_by_profile.email}
                          </span>
                        )}
                      </div>
                      <p className="font-medium text-foreground leading-tight">{obs.title}</p>
                      {obs.description && (
                        <p className="text-muted-foreground line-clamp-2">{obs.description}</p>
                      )}
                      <p className="text-muted-foreground">
                        {format(new Date(obs.created_at!), 'dd MMM yyyy')}
                        {obs.observer_role && ` · ${obs.observer_role}`}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

// ---- Department row ----
interface DepartmentRowProps {
  row: ScopedRow;
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa', value: string | null) => void;
  ratingThresholds?: RatingThresholds;
  targetValue?: number | null;
  uom?: string | null;
  criteria?: string;
  sentBackInfo?: SentBackInfo;
  isSelected: boolean;
  onToggleRow?: (scopeId: string, checked: boolean) => void;
  onPropagateRow?: (scopeId: string) => void;
  isPropagating?: boolean;
  hasSelectionFeature: boolean;
  hasRowPropagation: boolean;
}

function DepartmentRow({ row, onValueChange, ratingThresholds, targetValue, uom, criteria, sentBackInfo, isSelected, onToggleRow, onPropagateRow, isPropagating, hasSelectionFeature, hasRowPropagation }: DepartmentRowProps) {
  const rowIsNa = row.isNa ?? false;
  const effectiveTarget = row.targetValue != null ? row.targetValue : targetValue;
  const effectiveUom = row.uom != null ? row.uom : uom;
  const isSentBack = !!sentBackInfo;
  const canPropagate = (row.achievedValue !== null || rowIsNa) && !isPropagating;

  return (
    <TableRow className={`${rowIsNa ? 'opacity-60' : ''} ${isSentBack ? 'border-l-2 border-l-amber-500 bg-amber-50/30 dark:bg-amber-950/20' : ''}`}>
      {hasSelectionFeature && (
        <TableCell className="py-1.5 w-10 text-center">
          <Checkbox
            checked={isSelected}
            onCheckedChange={(checked) => onToggleRow?.(row.scopeId, !!checked)}
          />
        </TableCell>
      )}
      <TableCell className="text-sm py-1.5 min-w-[200px]">
        <div className="flex flex-col">
          <span className="font-medium">{row.scopeName}</span>
          {row.scopeSubText && (
            <span className="text-xs text-muted-foreground mt-0.5">{row.scopeSubText}</span>
          )}
          {isSentBack && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-400 gap-0.5 cursor-help mt-0.5 w-fit">
                    <Undo2 className="w-2.5 h-2.5" />
                    Sent Back
                  </Badge>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-[300px] text-xs">
                  <p className="font-medium">Sent back by {sentBackInfo.senderName}</p>
                  <p className="text-muted-foreground mt-0.5">{sentBackInfo.reason}</p>
                  <p className="text-muted-foreground mt-0.5">{format(new Date(sentBackInfo.date), 'dd MMM yyyy HH:mm')}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>
      </TableCell>
      <TableCell className="py-1.5 w-24 text-center">
        <span className={`text-xs ${rowIsNa ? 'text-muted-foreground/50' : 'text-muted-foreground'}`}>
          {row.targetValue != null ? row.targetValue : '—'}
          {row.uom && row.targetValue != null && <span className="ml-0.5 text-[10px]">{row.uom}</span>}
        </span>
      </TableCell>
      <TableCell className="py-1.5 w-16 text-center">
        <Switch
          checked={rowIsNa}
          onCheckedChange={(checked) => onValueChange(row.scopeId, 'isNa', checked ? 'true' : 'false')}
          className="scale-75"
        />
      </TableCell>
      <TableCell className="py-1.5 w-28">
        {rowIsNa ? (
          <div className="flex items-center justify-center gap-1 text-muted-foreground">
            <Ban className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">N/A</span>
          </div>
        ) : row.uomType === 'binary' || (row.uomType === 'tiered' && row.qualitativeOptions?.length) ? (
          <QualitativeSelect
            uomType={row.uomType}
            qualitativeOptions={(row.qualitativeOptions as QualitativeOption[]) || null}
            value={(() => {
              const opts = row.qualitativeOptions?.length
                ? row.qualitativeOptions
                : (row.uomType === 'binary' ? BINARY_OPTIONS : []);
              if (row.achievedValue === null) return null;
              const match = opts.find(o => Number(o.rating) === row.achievedValue);
              return match?.label || null;
            })()}
            onChange={(label, rating) => {
              onValueChange(row.scopeId, 'achievedValue', rating.toString());
            }}
            className="h-8 w-full text-sm"
          />
        ) : (
          <Input
            type="number"
            value={row.achievedValue ?? ''}
            onChange={(e) => onValueChange(row.scopeId, 'achievedValue', e.target.value)}
            placeholder="—"
            className="h-8 text-center text-sm"
          />
        )}
      </TableCell>
      <TableCell className="py-1.5 w-24 text-center">
        {rowIsNa || row.achievedValue === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (row.uomType === 'binary' || (row.uomType === 'tiered' && row.qualitativeOptions?.length)) ? (
          <RatingBadge score={row.achievedValue} short className="text-[10px] h-5 px-1.5" />
        ) : (
          <RatingBadge
            score={calculateRating(
              row.achievedValue, effectiveTarget, ratingThresholds || { r5: null, r4: null, r3: null, r2: null, r1: null },
              criteria, 0, 'numeric', null, effectiveUom
            ).rating}
            short
            className="text-[10px] h-5 px-1.5"
          />
        )}
      </TableCell>

      <TableCell className="py-1.5 min-w-[220px]">
        {rowIsNa ? (
          <Textarea
            value={row.remarks}
            onChange={(e) => onValueChange(row.scopeId, 'remarks', e.target.value)}
            placeholder="Reason for N/A (required)"
            className="text-sm resize-none min-h-0 border-destructive/50"
            rows={2}
            required
          />
        ) : (
          <Textarea
            value={row.remarks}
            onChange={(e) => onValueChange(row.scopeId, 'remarks', e.target.value)}
            placeholder="Remark"
            className="text-sm resize-none min-h-0"
            rows={2}
          />
        )}
      </TableCell>
      <TableCell className="py-1.5 w-24">
        {!rowIsNa && (
          <OrgKpiFileUpload
            existingUrl={row.evidenceUrl}
            onUploadComplete={(url) => onValueChange(row.scopeId, 'evidenceUrl', url)}
          />
        )}
      </TableCell>
      {hasRowPropagation && (
        <TableCell className="py-1.5 w-16 text-center">
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 w-7 p-0"
                  disabled={!canPropagate}
                  onClick={() => onPropagateRow?.(row.scopeId)}
                >
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </Button>
              </TooltipTrigger>
              <TooltipContent side="top" className="text-xs">
                Propagate this department only
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </TableCell>
      )}
    </TableRow>
  );
}
