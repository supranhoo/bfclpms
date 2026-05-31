import { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ShieldOff, Plus, Trash2, Loader2, Eye } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { EmployeeCombobox } from '@/components/admin/EmployeeCombobox';

import { useActiveEmployeesForCopy } from '@/hooks/useActiveEmployeesForCopy';
import {
  useEligibilityExclusions,
  useAddEligibilityExclusions,
  useRemoveEligibilityExclusion,
  type EligibilityExclusionRow,
} from '@/hooks/useIncrementEligibility';

interface Props {
  configId: string;
  defaultAssessmentYear: string;
  knownYears: string[];
  readOnly: boolean;
}

/**
 * Per-Assessment-Year employee exclusions for an Increment Eligibility config.
 * Excluded employees bypass criteria evaluation for the chosen AY only —
 * exclusions never apply across other assessment years.
 */
export function ExclusionsCard({ configId, defaultAssessmentYear, knownYears, readOnly }: Props) {
  const [showAllYears, setShowAllYears] = useState(false);
  const [activeAY, setActiveAY] = useState(defaultAssessmentYear);

  // Keep activeAY in sync when the parent scope's AY changes.
  useEffect(() => {
    setActiveAY(defaultAssessmentYear);
  }, [defaultAssessmentYear]);

  const filterAY = showAllYears ? undefined : activeAY;
  const { data: rows = [], isLoading } = useEligibilityExclusions(configId, filterAY);
  const { data: roster = [] } = useActiveEmployeesForCopy();

  const addMut = useAddEligibilityExclusions();
  const removeMut = useRemoveEligibilityExclusion();

  // Add-panel state
  const [adding, setAdding] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [targetAY, setTargetAY] = useState<string>(defaultAssessmentYear);
  const [reason, setReason] = useState('');

  useEffect(() => {
    setTargetAY(defaultAssessmentYear);
  }, [defaultAssessmentYear]);

  // Years for the add-panel selector — union of known years and current AY.
  const yearOptions = useMemo(() => {
    return Array.from(new Set([defaultAssessmentYear, ...knownYears])).sort().reverse();
  }, [defaultAssessmentYear, knownYears]);

  // IDs already excluded for the target AY (so the picker hides them).
  const alreadyExcludedForTargetAY = useMemo(() => {
    return rows.filter((r) => r.assessment_year === targetAY).map((r) => r.employee_id);
  }, [rows, targetAY]);

  const [deleteTarget, setDeleteTarget] = useState<EligibilityExclusionRow | null>(null);

  function resetAddPanel() {
    setAdding(false);
    setSelectedEmployees([]);
    setReason('');
    setTargetAY(defaultAssessmentYear);
  }

  function handleAdd() {
    if (selectedEmployees.length === 0 || !targetAY) return;
    addMut.mutate(
      {
        config_id: configId,
        assessment_year: targetAY,
        employee_ids: selectedEmployees,
        reason: reason.trim() || null,
      },
      { onSuccess: () => resetAddPanel() },
    );
  }

  return (
    <div className="rounded-lg border bg-card">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-2 p-3 border-b">
        <div className="flex items-center gap-2">
          <ShieldOff className="h-5 w-5 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Ineligibility Criteria Exempt Employees</h4>
          {!showAllYears && (
            <Badge variant="secondary" className="ml-1">AY {activeAY}</Badge>
          )}
          {showAllYears && (
            <Badge variant="outline" className="ml-1">All Years (read-only)</Badge>
          )}
          {readOnly && !showAllYears && (
            <span className="text-[10px] text-muted-foreground italic ml-1">
              Ineligibility criteria approved — exclusions still editable
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Eye className="h-3.5 w-3.5" />
            <span>Show all years</span>
            <Switch checked={showAllYears} onCheckedChange={setShowAllYears} />
          </div>
          {!showAllYears && !adding && (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4 mr-1" /> Add Exclusion
            </Button>
          )}
        </div>
      </div>

      <div className="p-3 space-y-3">
        <p className="text-xs text-muted-foreground">
          These employees bypass the <strong>Increment Ineligibility Criteria only</strong>. They
          remain subject to PMS score, valid slab, increment method, salary inputs, and
          confirmation-increment rules. They will not be disqualified by any active ineligibility
          criterion configured here.{' '}
          {showAllYears ? (
            <>for the specific Assessment Year shown on each row only.</>
          ) : (
            <>
              Applies to Assessment Year <strong>{activeAY}</strong> only. They remain governed by
              criteria in every other Assessment Year.
            </>
          )}{' '}
          Changes are audited.
        </p>

        {/* Add panel */}
        {adding && !showAllYears && (
          <div className="rounded-md border bg-muted/30 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="md:col-span-2 space-y-1.5">
                <Label className="text-xs">
                  Employees <span className="text-destructive">*</span>
                </Label>
                <EmployeeCombobox
                  multiple
                  employees={roster}
                  value={selectedEmployees}
                  onChange={setSelectedEmployees}
                  excludeIds={alreadyExcludedForTargetAY}
                  placeholder="Search by name, code or department…"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">
                  Assessment Year <span className="text-destructive">*</span>
                </Label>
                <Select value={targetAY} onValueChange={setTargetAY}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select AY" />
                  </SelectTrigger>
                  <SelectContent>
                    {yearOptions.map((y) => (
                      <SelectItem key={y} value={y}>{y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-[10px] text-muted-foreground">
                  Exclusion applies only to this year.
                </p>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Reason (optional)</Label>
              <Input
                placeholder='e.g. "Board member" / "Senior leadership exemption"'
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="h-9"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" size="sm" onClick={resetAddPanel} disabled={addMut.isPending}>
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleAdd}
                disabled={selectedEmployees.length === 0 || !targetAY || addMut.isPending}
              >
                {addMut.isPending ? (
                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4 mr-1" />
                )}
                Add {selectedEmployees.length > 0 ? `${selectedEmployees.length} ` : ''}
                {selectedEmployees.length === 1 ? 'Employee' : 'Employees'}
              </Button>
            </div>
          </div>
        )}

        {/* Table */}
        <ScrollArea className="w-full">
          <div className="rounded-md border min-w-[720px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-28">Code</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead className="w-32">Assessment Year</TableHead>
                  <TableHead>Reason</TableHead>
                  <TableHead className="w-28">Added On</TableHead>
                  <TableHead className="w-16 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…
                    </TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-4">
                      {showAllYears
                        ? 'No exclusions recorded for this configuration.'
                        : `No exclusions for ${activeAY}. All employees in this scope are governed by the criteria above for this Assessment Year.`}
                    </TableCell>
                  </TableRow>
                ) : (
                  rows.map((row) => (
                    <TableRow key={row.id}>
                      <TableCell className="font-mono text-xs">
                        {row.profiles?.employee_code ?? '—'}
                      </TableCell>
                      <TableCell className="font-medium">
                        {row.profiles?.full_name ?? row.employee_id}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {row.profiles?.departments?.name ?? '—'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="secondary">{row.assessment_year}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={row.reason ?? ''}>
                        {row.reason || '—'}
                      </TableCell>
                      <TableCell className="text-xs">
                        {format(new Date(row.added_at), 'dd MMM yyyy')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={showAllYears}
                          title={
                            showAllYears
                              ? 'Switch off "Show all years" to edit'
                              : 'Remove exclusion'
                          }
                          onClick={() => setDeleteTarget(row)}
                        >
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ScrollArea>

        <div className="text-xs text-muted-foreground">
          {showAllYears ? (
            <>Total excluded across all years: <strong>{rows.length}</strong></>
          ) : (
            <>Total excluded for {activeAY}: <strong>{rows.length}</strong></>
          )}
        </div>
      </div>

      <ConfirmDestructiveDialog
        open={!!deleteTarget}
        onConfirm={() => {
          if (deleteTarget) {
            removeMut.mutate(
              { id: deleteTarget.id, config_id: deleteTarget.config_id },
              { onSuccess: () => setDeleteTarget(null) },
            );
          }
        }}
        onCancel={() => setDeleteTarget(null)}
        title="Remove Exclusion"
        description={
          deleteTarget
            ? `Remove ${deleteTarget.profiles?.full_name ?? 'this employee'} from the ${deleteTarget.assessment_year} exclusion list? They will once again be governed by the Increment Ineligibility Criteria for ${deleteTarget.assessment_year}. This change will be recorded in the audit trail.`
            : ''
        }
        confirmLabel="Remove"
        isLoading={removeMut.isPending}
      />
    </div>
  );
}

export default ExclusionsCard;