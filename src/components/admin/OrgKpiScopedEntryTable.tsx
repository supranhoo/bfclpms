import { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { OrgKpiFileUpload } from '@/components/admin/OrgKpiFileUpload';
import { isValueOutOfRange, RatingThresholds, calculateRating } from '@/lib/ratingCalculation';
import { RatingBadge } from '@/components/ui/RatingBadge';
import { QualitativeSelect } from '@/components/review/QualitativeSelect';
import { BINARY_OPTIONS, type QualitativeOption } from '@/lib/qualitativeUom';
import { ChevronDown, ChevronRight, Building2, AlertTriangle, Ban, TrendingUp, TrendingDown } from 'lucide-react';

export interface ScopedRow {
  scopeId: string; // departmentId or employeeId
  scopeName: string;
  scopeSubText?: string; // e.g. comma-separated employee names under a department
  departmentName?: string; // for grouping/sorting employee-scope rows
  designation?: string;    // for display in employee column
  achievedValue: number | null;
  remarks: string;
  evidenceUrl: string | null;
  isNa?: boolean;
  targetValue?: number | null;
  uom?: string | null;
  uomType?: 'numeric' | 'binary' | 'tiered' | null;
  qualitativeOptions?: Array<{ label: string; rating: number; definition: string }> | null;
}

export interface ObservationCounts {
  positive: number;
  concern: number;
  neutral: number;
}

interface OrgKpiScopedEntryTableProps {
  rows: ScopedRow[];
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa', value: string | null) => void;
  scopeLabel: string; // "Department" or "Employee"
  // For out-of-range warnings and rating calculation
  ratingThresholds?: RatingThresholds;
  targetValue?: number | null;
  uom?: string | null;
  criteria?: string;
  // Observation counts per employee
  observationCounts?: Map<string, ObservationCounts>;
}

export function OrgKpiScopedEntryTable({ rows, onValueChange, scopeLabel, ratingThresholds, targetValue, uom, criteria, observationCounts }: OrgKpiScopedEntryTableProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [bulkFillValue, setBulkFillValue] = useState('');

  const naCount = rows.filter(r => r.isNa).length;
  const allQualitative = rows.length > 0 && rows.every(r => r.uomType === 'binary' || (r.uomType === 'tiered' && r.qualitativeOptions?.length));
  const enteredCount = rows.filter(r => r.achievedValue !== null || r.isNa).length;
  const allEntered = rows.length > 0 && enteredCount === rows.length;

  // Sort rows
  const isEmployeeScope = scopeLabel === 'Employee';
  const sortedRows = [...rows].sort((a, b) => {
    if (isEmployeeScope) {
      // Sort by departmentName A→Z, then by scopeName A→Z
      const deptA = a.departmentName ?? '';
      const deptB = b.departmentName ?? '';
      if (deptA !== deptB) return deptA.localeCompare(deptB);
      return a.scopeName.localeCompare(b.scopeName);
    }
    // Department scope: sort by name A→Z
    return a.scopeName.localeCompare(b.scopeName);
  });

  // Build grouped structure for employee scope
  const groupedRows: Array<{ dept: string | null; rows: ScopedRow[] }> = [];
  if (isEmployeeScope) {
    let lastDept: string | null = null;
    for (const row of sortedRows) {
      const dept = row.departmentName ?? null;
      if (dept !== lastDept) {
        groupedRows.push({ dept, rows: [row] });
        lastDept = dept;
      } else {
        groupedRows[groupedRows.length - 1].rows.push(row);
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

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="flex items-center gap-2 flex-wrap">
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="sm" className="justify-start gap-2 text-sm flex-shrink-0">
            {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            {rows.length} {scopeLabel}s
            <span className={allEntered ? 'text-green-600 dark:text-green-400 font-medium' : 'text-muted-foreground'}>
              ({enteredCount} / {rows.length} entered{naCount > 0 ? `, ${naCount} N/A` : ''})
            </span>
          </Button>
        </CollapsibleTrigger>

        {/* Bulk fill — inline next to the trigger (hidden for qualitative KPIs) */}
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
                <TableHead className="text-xs min-w-[200px]">{scopeLabel}</TableHead>
                <TableHead className="text-xs w-24 text-center">Target</TableHead>
                <TableHead className="text-xs w-16 text-center">N/A</TableHead>
                <TableHead className="text-xs w-28 text-center">Achieved</TableHead>
                <TableHead className="text-xs w-24 text-center">Rating</TableHead>
                <TableHead className="text-xs min-w-[220px]">Remark</TableHead>
                <TableHead className="text-xs w-24">File</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isEmployeeScope ? (
                // Grouped by department
                groupedRows.map(group => (
                  <>
                    {/* Department group header */}
                    <TableRow key={`group-${group.dept ?? 'none'}`} className="bg-muted/50 hover:bg-muted/50">
                      <TableCell colSpan={7} className="py-1.5 px-3">
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
                    {/* Employee rows within group */}
                    {group.rows.map(row => (
                      <EmployeeRow
                        key={row.scopeId}
                        row={row}
                        onValueChange={onValueChange}
                        ratingThresholds={ratingThresholds}
                        targetValue={targetValue}
                        uom={uom}
                        criteria={criteria}
                        observationCounts={observationCounts?.get(row.scopeId)}
                      />
                    ))}
                  </>
                ))
              ) : (
                // Department scope — flat sorted list
                sortedRows.map(row => (
                  <DepartmentRow key={row.scopeId} row={row} onValueChange={onValueChange} ratingThresholds={ratingThresholds} targetValue={targetValue} uom={uom} criteria={criteria} />
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

// ---- Employee row (with dept/designation badges + out-of-range warning) ----
interface EmployeeRowProps {
  row: ScopedRow;
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa', value: string | null) => void;
  ratingThresholds?: RatingThresholds;
  targetValue?: number | null;
  uom?: string | null;
  criteria?: string;
  observationCounts?: ObservationCounts;
}

function EmployeeRow({ row, onValueChange, ratingThresholds, targetValue, uom, criteria, observationCounts }: EmployeeRowProps) {
  // Prefer per-employee target over card-level fallback
  const effectiveTarget = row.targetValue != null ? row.targetValue : targetValue;
  const effectiveUom = row.uom != null ? row.uom : uom;

  const numVal = row.achievedValue;
  const outOfRange = numVal !== null && ratingThresholds
    ? isValueOutOfRange(numVal, effectiveTarget ?? null, ratingThresholds, effectiveUom ?? null)
    : null;

  const rowIsNa = row.isNa ?? false;

  return (
    <TableRow className={rowIsNa ? 'opacity-60' : ''}>
      {/* Name + dept/designation */}
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
            {observationCounts && observationCounts.positive > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950/30 dark:text-green-400 gap-0.5">
                <TrendingUp className="w-2.5 h-2.5" />
                Positive: {observationCounts.positive}
              </Badge>
            )}
            {observationCounts && observationCounts.concern > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950/30 dark:text-red-400 gap-0.5">
                <TrendingDown className="w-2.5 h-2.5" />
                Concern: {observationCounts.concern}
              </Badge>
            )}
            {observationCounts && observationCounts.neutral > 0 && (
              <Badge variant="outline" className="text-[10px] h-4 px-1.5 font-normal gap-0.5">
                Neutral: {observationCounts.neutral}
              </Badge>
            )}
          </div>
        </div>
      </TableCell>

      {/* Target (read-only) — per-employee target preferred */}
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

      {/* Rating (read-only) */}
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

      {/* Remark textarea */}
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
    </TableRow>
  );
}

// ---- Department row (simpler — no dept/designation, but wider remark) ----
interface DepartmentRowProps {
  row: ScopedRow;
  onValueChange: (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa', value: string | null) => void;
  ratingThresholds?: RatingThresholds;
  targetValue?: number | null;
  uom?: string | null;
  criteria?: string;
}

function DepartmentRow({ row, onValueChange, ratingThresholds, targetValue, uom, criteria }: DepartmentRowProps) {
  const rowIsNa = row.isNa ?? false;
  const effectiveTarget = row.targetValue != null ? row.targetValue : targetValue;
  const effectiveUom = row.uom != null ? row.uom : uom;

  return (
    <TableRow className={rowIsNa ? 'opacity-60' : ''}>
      <TableCell className="text-sm py-1.5 min-w-[200px]">
        <div className="flex flex-col">
          <span className="font-medium">{row.scopeName}</span>
          {row.scopeSubText && (
            <span className="text-xs text-muted-foreground mt-0.5">{row.scopeSubText}</span>
          )}
        </div>
      </TableCell>
      {/* Target (read-only) */}
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
      {/* Rating (read-only) */}
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
    </TableRow>
  );
}
