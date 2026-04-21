import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { OrgKpiFileUpload } from '@/components/admin/OrgKpiFileUpload';
import { OrgKpiAuditLog } from '@/components/admin/OrgKpiAuditLog';
import { OrgKpiScopedEntryTable, ScopedRow } from '@/components/admin/OrgKpiScopedEntryTable';
import { useObservationsByKpis } from '@/hooks/useKpiObservations';
import type { KpiObservation } from '@/hooks/useKpiObservations';
import { OrgKpiOwnerDialog } from '@/components/admin/OrgKpiOwnerDialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isValueOutOfRange, RatingThresholds } from '@/lib/ratingCalculation';
import { Textarea } from '@/components/ui/textarea';
import { QualitativeSelect } from '@/components/review/QualitativeSelect';
import { BINARY_OPTIONS, type QualitativeOption } from '@/lib/qualitativeUom';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Loader2, CheckCircle2, Clock, ArrowUpRight, Building2, Users, User, BarChart3, Lock, Unlock, AlertTriangle, RotateCcw, Trash2, Ban, Undo2 } from 'lucide-react';
import { useSentBackOrgKpiEmployees, type SentBackInfo } from '@/hooks/useSentBackOrgKpiEmployees';
import { isComplianceKpi, useBulkEmployeeSubmissionDates } from '@/hooks/useComplianceSubFactors';

export interface OrgKpiCardData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  kraName: string;
  kpiName: string;
  targetValue: number | null;
  uom: string | null;
  r5: string | null;
  r4: string | null;
  r3: string | null;
  r2: string | null;
  r1: string | null;
  scope: 'organization' | 'department' | 'employee';
  // Current values
  achievedValue: number | null;
  remarks: string;
  evidenceUrl: string | null;
  // Previous period
  previousValue: number | null;
  previousPeriodLabel: string | null;
  // Status
  status: 'pending' | 'entered' | 'propagated';
  // Scoped rows for dept/employee scope
  scopedRows?: ScopedRow[];
  scopeLabel?: string;
  // Employee count (from useOrgLevelKpisWithEmployees)
  employeeCount?: number;
  // N/A status
  isNa?: boolean;
  // Qualitative UOM support
  uomType?: 'numeric' | 'binary' | 'tiered' | null;
  qualitativeOptions?: Array<{ label: string; rating: number; definition: string }> | null;
  criteria?: string | null;
}

interface OrgKpiEntryCardProps {
  data: OrgKpiCardData;
  reviewPeriod: string;
  reviewYear: number;
  isAdmin?: boolean;
  governanceLocked?: boolean;
  employeeKpiIds?: string[];
  sentBackMap?: Map<string, SentBackInfo>;
  onSave: (values: {
    achievedValue: number | null;
    remarks: string;
    evidenceUrl: string | null;
    isNa?: boolean;
    naRemarks?: string;
    scopedValues?: Array<{ scopeId: string; achievedValue: number | null; remarks: string; evidenceUrl: string | null; isNa?: boolean }>;
  }) => Promise<void>;
  onSaveAndPropagate: (values: {
    achievedValue: number | null;
    remarks: string;
    evidenceUrl: string | null;
    isNa?: boolean;
    naRemarks?: string;
    scopedValues?: Array<{ scopeId: string; achievedValue: number | null; remarks: string; evidenceUrl: string | null; isNa?: boolean }>;
  }, employeeIds?: string[]) => Promise<void>;
  onUnlock?: () => Promise<void>;
  onRollback?: (reason: string) => Promise<void>;
  onBulkRollback?: (reason: string) => Promise<void>;
  onOpenImpact: () => void;
  onRemoveFromOrg?: () => Promise<void>;
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, variant: 'outline' as const, className: 'text-muted-foreground border-muted-foreground/30' },
  entered: { label: 'Value Entered', icon: CheckCircle2, variant: 'secondary' as const, className: 'text-orange-600 bg-orange-50 border-orange-200 dark:text-orange-400 dark:bg-orange-950 dark:border-orange-800' },
  propagated: { label: 'Propagated', icon: ArrowUpRight, variant: 'default' as const, className: 'text-green-600 bg-green-50 border-green-200 dark:text-green-400 dark:bg-green-950 dark:border-green-800' },
};

const scopeIcons = {
  organization: Building2,
  department: Users,
  employee: User,
};

export function OrgKpiEntryCard({ data, reviewPeriod, reviewYear, isAdmin, governanceLocked, employeeKpiIds, sentBackMap, onSave, onSaveAndPropagate, onUnlock, onRollback, onBulkRollback, onOpenImpact, onRemoveFromOrg }: OrgKpiEntryCardProps) {
  const isLocked = (data.status === 'propagated' && !isAdmin) || (governanceLocked === true);
  const isPropagated = data.status === 'propagated';
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [isBulkRollingBack, setIsBulkRollingBack] = useState(false);
  const [isRemoving, setIsRemoving] = useState(false);
  const [showOwnerDialog, setShowOwnerDialog] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [bulkRollbackReason, setBulkRollbackReason] = useState('');
  const [achievedValue, setAchievedValue] = useState<string>(data.achievedValue?.toString() ?? '');
  const [remarks, setRemarks] = useState(data.remarks);
  const [evidenceUrl, setEvidenceUrl] = useState(data.evidenceUrl);
  const [scopedValues, setScopedValues] = useState<ScopedRow[]>(data.scopedRows || []);
  const [isNa, setIsNa] = useState(data.isNa ?? false);
  const [selectedScopeIds, setSelectedScopeIds] = useState<string[]>([]);

  // Fetch observations for employee-scoped KPIs (React Query deduplicates with OrgKpiObservationsSummary)
  const isEmployeeScope = data.scope === 'employee';
  const obsKpiIds = isEmployeeScope && employeeKpiIds ? employeeKpiIds : [];
  const { data: observationMap } = useObservationsByKpis(obsKpiIds);

  // Sent-back detection for scoped KPIs (self-contained — no parent wiring needed)
  const isScoped = data.scope === 'department' || data.scope === 'employee';
  const { data: internalSentBackMap } = useSentBackOrgKpiEmployees(
    isScoped ? data.categoryId : undefined,
    isScoped ? data.kraName : undefined,
    isScoped ? data.kpiName : undefined,
    isScoped ? reviewPeriod : undefined,
    isScoped ? reviewYear : undefined,
  );
  const effectiveSentBackMap = sentBackMap ?? internalSentBackMap;

  // Compliance KPI detection + submission dates
  // N-1 logic: for compliance KPI, show when previous month's KPIs were self-reviewed
  const isCompliance = isComplianceKpi(data.kraName);
  const MONTHS_LIST = ['January','February','March','April','May','June',
    'July','August','September','October','November','December'];
  const prevMonthIdx = MONTHS_LIST.indexOf(reviewPeriod) - 1;
  const complianceMonth = prevMonthIdx < 0 ? 'December' : MONTHS_LIST[prevMonthIdx];
  const complianceYear = prevMonthIdx < 0 ? reviewYear - 1 : reviewYear;
  const employeeIdsForCompliance = isCompliance && isEmployeeScope ? (data.scopedRows || []).map(r => r.scopeId) : [];
  const { data: submissionDates } = useBulkEmployeeSubmissionDates(
    employeeIdsForCompliance,
    isCompliance ? complianceMonth : reviewPeriod,
    isCompliance ? complianceYear : reviewYear,
    isCompliance && isEmployeeScope
  );

  const employeeObservations = useMemo(() => {
    if (!observationMap || observationMap.size === 0) return undefined;
    const grouped = new Map<string, KpiObservation[]>();
    observationMap.forEach((observations) => {
      observations.forEach(obs => {
        const empId = obs.kpi?.employee_id;
        if (!empId) return;
        const existing = grouped.get(empId) || [];
        existing.push(obs);
        grouped.set(empId, existing);
      });
    });
    return grouped.size > 0 ? grouped : undefined;
  }, [observationMap]);
  const [naRemarks, setNaRemarks] = useState('');

  // Refs to always access latest values (fixes stale closure in auto-save)
  const achievedValueRef = useRef(achievedValue);
  const remarksRef = useRef(remarks);
  const evidenceUrlRef = useRef(evidenceUrl);
  const scopedValuesRef = useRef(scopedValues);

  useEffect(() => { achievedValueRef.current = achievedValue; }, [achievedValue]);
  useEffect(() => { remarksRef.current = remarks; }, [remarks]);
  useEffect(() => { evidenceUrlRef.current = evidenceUrl; }, [evidenceUrl]);
  useEffect(() => { scopedValuesRef.current = scopedValues; }, [scopedValues]);

  // v2.65.4 — Track which scope rows the user actually edited this session.
  // Used by parent's Propagate handler to skip untouched rows that happen to
  // hold a stale 0 from a prior Save, preventing silent zero-propagation.
  const touchedScopeIdsRef = useRef<Set<string>>(new Set());

  const [isPropagating, setIsPropagating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);
  const kpiIdentityRef = useRef('');

  useEffect(() => {
    const newIdentity = `${data.categoryId}||${data.kraName}||${data.kpiName}||${reviewPeriod}||${reviewYear}`;
    const identityChanged = newIdentity !== kpiIdentityRef.current;

    if (!identityChanged) {
      if (isDirtyRef.current) {
        // Merge: accept DB values for fields the user hasn't touched (prevents null overwrite race)
        if (data.scopedRows?.length) {
          setScopedValues(prev => prev.map(row => {
            const dbRow = data.scopedRows!.find(r => r.scopeId === row.scopeId);
            if (!dbRow) return row;
            // If local achievedValue is null but DB has a real value, take DB value
            if (row.achievedValue === null && dbRow.achievedValue !== null) {
              return { ...row, achievedValue: dbRow.achievedValue };
            }
            return row;
          }));
        }
        // For org-scope: merge achieved value from DB if local is null
        if (data.achievedValue !== null) {
          const currentNumeric = achievedValue === '' ? null : parseFloat(achievedValue);
          if (currentNumeric === null || isNaN(currentNumeric)) {
            setAchievedValue(data.achievedValue.toString());
          }
        }
        return;
      }
      const currentNumeric = achievedValue === '' ? null : parseFloat(achievedValue);
      const sameValue =
        currentNumeric === data.achievedValue ||
        (currentNumeric === null && data.achievedValue === null) ||
        (isNaN(currentNumeric as number) && data.achievedValue === null);
      const sameRemarks = remarks === data.remarks;
      const sameEvidence = evidenceUrl === data.evidenceUrl;
      if (sameValue && sameRemarks && sameEvidence) return;
    }

    kpiIdentityRef.current = newIdentity;
    setAchievedValue(data.achievedValue?.toString() ?? '');
    setRemarks(data.remarks);
    setEvidenceUrl(data.evidenceUrl);
    setScopedValues(data.scopedRows || []);
    setSaveStatus('idle');
    isDirtyRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.achievedValue, data.remarks, data.evidenceUrl, data.categoryId, data.kraName, data.kpiName, reviewPeriod, reviewYear]);

  // Secondary effect: merge subFactors (and achievedValue) from DB when scopedRows update after initial load
  useEffect(() => {
    if (!data.scopedRows?.length) return;
    // Don't overwrite active user edits
    if (isDirtyRef.current) return;
    setScopedValues(prev => {
      if (!prev.length) return data.scopedRows!;
      let changed = false;
      const merged = prev.map(row => {
        const dbRow = data.scopedRows!.find(r => r.scopeId === row.scopeId);
        if (!dbRow) return row;
        const needsMerge =
          (row.subFactors === undefined && dbRow.subFactors !== undefined) ||
          (row.achievedValue === null && dbRow.achievedValue !== null) ||
          (row.remarks === '' && dbRow.remarks) ||
          (row.evidenceUrl === null && dbRow.evidenceUrl !== null);
        if (needsMerge) {
          changed = true;
          return {
            ...row,
            subFactors: row.subFactors ?? dbRow.subFactors,
            achievedValue: row.achievedValue ?? dbRow.achievedValue,
            remarks: row.remarks || dbRow.remarks,
            evidenceUrl: row.evidenceUrl ?? dbRow.evidenceUrl,
          };
        }
        return row;
      });
      return changed ? merged : prev;
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data.scopedRows]);

  const getValues = useCallback(() => {
    const parsed = achievedValueRef.current === '' ? null : parseFloat(achievedValueRef.current);

    // Merge live submission dates into sub_factors for compliance KPI before save
    let finalScopedValues = scopedValuesRef.current;
    if (isCompliance && submissionDates && data.scope !== 'organization') {
      finalScopedValues = finalScopedValues.map(sv => {
        const subInfo = submissionDates.get(sv.scopeId);
        if (!subInfo) return sv;
        const sf = sv.subFactors || {
          policy_compliance: null, submission_date: null,
          submission_complete: false, submission_pending_count: 0,
          policy_training: null, other_observation: null,
        };
        return {
          ...sv,
          subFactors: {
            ...sf,
            submission_complete: subInfo.complete,
            submission_date: subInfo.date,
            submission_pending_count: subInfo.pendingCount,
          },
        };
      });
    }

    return {
      achievedValue: isNa ? null : (isNaN(parsed as number) ? null : parsed),
      remarks: isNa ? '' : remarksRef.current,
      evidenceUrl: isNa ? null : evidenceUrlRef.current,
      isNa,
      naRemarks: isNa ? naRemarks : undefined,
      scopedValues: data.scope !== 'organization'
        ? finalScopedValues.map(s => ({
            scopeId: s.scopeId,
            achievedValue: s.isNa ? null : s.achievedValue,
            remarks: s.isNa ? '' : s.remarks,
            evidenceUrl: s.isNa ? null : s.evidenceUrl,
            isNa: s.isNa,
            subFactors: s.subFactors,
            _touched: touchedScopeIdsRef.current.has(s.scopeId),
          }))
        : undefined,
    };
  }, [data.scope, isNa, naRemarks, isCompliance, submissionDates]);

  // Auto-save with debounce
  const triggerAutoSave = useCallback(() => {
    isDirtyRef.current = true;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(async () => {
      if (!isDirtyRef.current) return;
      setSaveStatus('saving');
      try {
        await onSave(getValues());
        isDirtyRef.current = false;
        setSaveStatus('saved');
        setTimeout(() => setSaveStatus('idle'), 3000);
      } catch {
        setSaveStatus('idle');
      }
    }, 2000);
  }, [onSave, getValues]);

  const handleSaveAndPropagate = async (filterIds?: string[]) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsPropagating(true);
    try {
      await onSaveAndPropagate(getValues(), filterIds);
      isDirtyRef.current = false;
      setSaveStatus('saved');
      setSelectedScopeIds([]);
    } finally {
      setIsPropagating(false);
    }
  };

  const handleScopedChange = (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl' | 'isNa' | 'subFactors', value: string | null) => {
    touchedScopeIdsRef.current.add(scopeId);
    setScopedValues(prev => prev.map(r => {
      if (r.scopeId !== scopeId) return r;
      if (field === 'subFactors') {
        const sf = value ? JSON.parse(value) : null;
        return { ...r, subFactors: sf };
      }
      if (field === 'isNa') {
        const na = value === 'true';
        return { ...r, isNa: na, ...(na ? { achievedValue: null, remarks: '', evidenceUrl: null } : {}) };
      }
      if (field === 'achievedValue') {
        const parsed = value === '' || value === null ? null : parseFloat(value);
        return { ...r, achievedValue: isNaN(parsed as number) ? null : parsed };
      }
      if (field === 'evidenceUrl') return { ...r, evidenceUrl: value };
      return { ...r, [field]: value || '' };
    }));
    triggerAutoSave();
  };

  const statusInfo = statusConfig[data.status];
  const StatusIcon = statusInfo.icon;
  const ScopeIcon = scopeIcons[data.scope];

  return (
    <>
    <Card className={`transition-all min-w-0 overflow-hidden ${isDirtyRef.current ? 'ring-1 ring-primary/30' : ''} ${
      isNa ? 'border-l-4 border-l-orange-400' :
      data.status === 'propagated' ? 'border-l-4 border-l-green-500' :
      data.status === 'entered' ? 'border-l-4 border-l-primary' :
      'border-l-4 border-l-muted-foreground/30'
    }`}>
      <CardContent className="p-4 space-y-2">
        {/* HEADER — KPI identity + metadata */}
        <div className="space-y-1">
          <h3 className="text-sm font-semibold whitespace-pre-wrap break-words">{data.kpiName}</h3>
          <p className="text-xs text-muted-foreground break-words">KRA: {data.kraName}</p>

          <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <ScopeIcon className="h-3.5 w-3.5" />
              {data.scope === 'organization' ? 'Org-wide' : data.scope === 'department' ? 'Per Department' : 'Per Employee'}
            </span>
            {data.targetValue !== null && (
              <span>Target: <span className="font-medium text-foreground">{data.targetValue}</span></span>
            )}
            {data.uom && (
              <span>UOM: <span className="font-medium text-foreground">{data.uom}</span></span>
            )}
          </div>

          {data.previousValue !== null && data.previousPeriodLabel && (
            <p className="text-xs text-muted-foreground">
              Prev ({data.previousPeriodLabel}): <span className="font-medium text-foreground">{data.previousValue}</span>
            </p>
          )}

          <div className="flex flex-wrap items-center gap-2">
            {isNa ? (
              <Badge variant="outline" className="gap-1 text-xs text-muted-foreground">
                <Ban className="h-3 w-3" />
                N/A
              </Badge>
            ) : (
              <Badge variant={statusInfo.variant} className={`gap-1 text-xs ${statusInfo.className}`}>
                <StatusIcon className="h-3 w-3" />
                {statusInfo.label}
              </Badge>
            )}
            {data.employeeCount !== undefined && data.employeeCount > 0 && (
              <Badge variant="outline" className="gap-1 text-xs">
                <Users className="h-3 w-3" />
                {data.employeeCount} employee{data.employeeCount !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
        </div>

        {/* CONTENT — N/A toggle + scope-specific inputs */}
        <div className="space-y-2">
          {/* N/A Toggle - Admin only */}
          {isAdmin && !isLocked && (
            <div className="flex items-center gap-2">
              <Switch
                id={`na-toggle-${data.categoryId}-${data.kpiName}`}
                checked={isNa}
                onCheckedChange={(checked) => {
                  setIsNa(checked);
                  isDirtyRef.current = true;
                  triggerAutoSave();
                }}
              />
              <Label htmlFor={`na-toggle-${data.categoryId}-${data.kpiName}`} className="text-xs font-medium cursor-pointer">
                Mark as Not Applicable (N/A)
              </Label>
            </div>
          )}

          {/* Input area - org scope */}
          {data.scope === 'organization' && !isNa && (
            <div className="space-y-2">
              {data.uomType === 'binary' || (data.uomType === 'tiered' && data.qualitativeOptions?.length) ? (
                <QualitativeSelect
                  uomType={data.uomType}
                  qualitativeOptions={(data.qualitativeOptions as QualitativeOption[]) || null}
                  value={(() => {
                    // Find option label matching stored rating
                    const opts = data.qualitativeOptions?.length
                      ? data.qualitativeOptions
                      : (data.uomType === 'binary' ? BINARY_OPTIONS : []);
                    const numVal = achievedValue === '' ? null : parseFloat(achievedValue);
                    if (numVal === null || isNaN(numVal)) return null;
                    const match = opts.find(o => Number(o.rating) === numVal);
                    return match?.label || null;
                  })()}
                  onChange={(label, rating) => {
                    setAchievedValue(rating.toString());
                    triggerAutoSave();
                  }}
                  disabled={isLocked}
                  className="h-9"
                />
              ) : (
                <>
                  <Input
                    type="number"
                    value={achievedValue}
                    onChange={(e) => { setAchievedValue(e.target.value); triggerAutoSave(); }}
                    placeholder="Achieved value"
                    className="h-9"
                    disabled={isLocked}
                  />
                  {(() => {
                    const numVal = achievedValue === '' ? null : parseFloat(achievedValue);
                    if (numVal === null || isNaN(numVal)) return null;
                    const thresholds: RatingThresholds = { r5: data.r5, r4: data.r4, r3: data.r3, r2: data.r2, r1: data.r1 };
                    const check = isValueOutOfRange(numVal, data.targetValue, thresholds, data.uom);
                    if (!check.outOfRange) return null;
                    return (
                      <Alert variant="default" className="border-orange-500/50 bg-orange-50 dark:bg-orange-950/30 py-2">
                        <AlertTriangle className="h-4 w-4 text-orange-600" />
                        <AlertDescription className="text-xs text-orange-700 dark:text-orange-400">
                          {check.message}
                        </AlertDescription>
                      </Alert>
                    );
                  })()}
                </>
              )}
              <Input
                value={remarks}
                onChange={(e) => { setRemarks(e.target.value); triggerAutoSave(); }}
                placeholder="Remark"
                className="h-9"
                disabled={isLocked}
              />
              {!isLocked && (
                <OrgKpiFileUpload
                  existingUrl={evidenceUrl}
                  onUploadComplete={(url) => { setEvidenceUrl(url); triggerAutoSave(); }}
                />
              )}
            </div>
          )}

          {/* N/A view */}
          {isNa && (
            <div className="space-y-2">
              <Alert variant="default" className="border-muted bg-muted/50 py-2">
                <Ban className="h-4 w-4 text-muted-foreground" />
                <AlertDescription className="text-xs text-muted-foreground">
                  This KPI is marked as <strong>Not Applicable</strong>. Scores will be excluded from calculations.
                </AlertDescription>
              </Alert>
              <Textarea
                value={naRemarks}
                onChange={(e) => { setNaRemarks(e.target.value); triggerAutoSave(); }}
                placeholder="Reason for marking as N/A (required)"
                rows={2}
                disabled={isLocked}
              />
            </div>
          )}

          {/* Scoped entry table for dept/employee */}
          {data.scope !== 'organization' && data.scopeLabel && !isNa && (
            <OrgKpiScopedEntryTable
              rows={scopedValues}
              onValueChange={handleScopedChange}
              scopeLabel={data.scopeLabel}
              ratingThresholds={{ r5: data.r5, r4: data.r4, r3: data.r3, r2: data.r2, r1: data.r1 }}
              targetValue={data.targetValue}
              uom={data.uom}
              criteria={data.criteria ?? undefined}
              employeeObservations={employeeObservations}
              sentBackMap={effectiveSentBackMap}
              selectedIds={selectedScopeIds}
              onSelectionChange={setSelectedScopeIds}
              onPropagateRow={(scopeId) => handleSaveAndPropagate([scopeId])}
              isPropagating={isPropagating}
              isComplianceKpi={isCompliance}
              submissionDates={submissionDates}
            />
          )}

          {/* Lock banner */}
          {isLocked && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm text-muted-foreground">
              <Lock className="h-4 w-4 shrink-0" />
              <span>Locked after propagation. Contact admin to unlock.</span>
            </div>
          )}
        </div>

        {/* FOOTER — action buttons at bottom */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t mt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <OrgKpiAuditLog
              categoryId={data.categoryId}
              kraName={data.kraName}
              kpiName={data.kpiName}
              reviewPeriod={reviewPeriod}
              reviewYear={reviewYear}
            />
            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={onOpenImpact}>
              <BarChart3 className="h-3.5 w-3.5" />
              Impact
            </Button>
            {isAdmin && (
              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={() => setShowOwnerDialog(true)}>
                <Users className="h-3.5 w-3.5" />
                Data Owners
              </Button>
            )}
            {isPropagated && isAdmin && onUnlock && (
              <Button
                variant="outline"
                size="sm"
                className="h-7 px-2 text-xs gap-1"
                disabled={isUnlocking}
                onClick={async () => {
                  setIsUnlocking(true);
                  try { await onUnlock(); } finally { setIsUnlocking(false); }
                }}
              >
                {isUnlocking ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Unlock className="h-3.5 w-3.5" />}
                Unlock
              </Button>
            )}
            {isPropagated && isAdmin && onRollback && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                    disabled={isRollingBack}
                  >
                    {isRollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Rollback
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rollback to Data Entry</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <p>
                          This will <strong>clear propagated values</strong> from {data.employeeCount || 0} employee scorecard{(data.employeeCount || 0) !== 1 ? 's' : ''} and reset this KPI for fresh data entry.
                        </p>
                        <p className="text-destructive font-medium">
                          This action cannot be undone. Employee self-review scores will be removed.
                        </p>
                        <Textarea
                          placeholder="Reason for rollback (required)"
                          value={rollbackReason}
                          onChange={(e) => setRollbackReason(e.target.value)}
                          className="mt-2"
                          rows={2}
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setRollbackReason('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={!rollbackReason.trim() || isRollingBack}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async (e) => {
                        e.preventDefault();
                        setIsRollingBack(true);
                        try {
                          await onRollback(rollbackReason.trim());
                          setRollbackReason('');
                        } finally {
                          setIsRollingBack(false);
                        }
                      }}
                    >
                      {isRollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      Confirm Rollback
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {/* Bulk Rollback — only for scoped KPIs with multiple propagated entries */}
            {isPropagated && isAdmin && onBulkRollback && data.scope !== 'organization' && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                    disabled={isBulkRollingBack}
                  >
                    {isBulkRollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    Rollback All Scopes
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Rollback All Scopes to Data Entry</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-3">
                        <p>
                          This will <strong>clear propagated values across all {data.scopedRows?.length || 'all'} department scopes</strong> of <strong>"{data.kpiName}"</strong> and reset them for fresh data entry.
                        </p>
                        <p className="text-destructive font-medium">
                          All employee self-review scores linked to this KPI will be removed. This cannot be undone.
                        </p>
                        <Textarea
                          placeholder="Reason for bulk rollback (required)"
                          value={bulkRollbackReason}
                          onChange={(e) => setBulkRollbackReason(e.target.value)}
                          className="mt-2"
                          rows={2}
                        />
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel onClick={() => setBulkRollbackReason('')}>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={!bulkRollbackReason.trim() || isBulkRollingBack}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async (e) => {
                        e.preventDefault();
                        setIsBulkRollingBack(true);
                        try {
                          await onBulkRollback(bulkRollbackReason.trim());
                          setBulkRollbackReason('');
                        } finally {
                          setIsBulkRollingBack(false);
                        }
                      }}
                    >
                      {isBulkRollingBack ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      Confirm Bulk Rollback
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
            {isAdmin && !isPropagated && onRemoveFromOrg && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 px-2 text-xs gap-1 border-destructive/50 text-destructive hover:bg-destructive/10"
                    disabled={isRemoving}
                  >
                    {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
                    Remove
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Remove from Organization KPIs</AlertDialogTitle>
                    <AlertDialogDescription asChild>
                      <div className="space-y-2">
                        <p>
                          This will remove <strong>"{data.kpiName}"</strong> from organization-level tracking.
                        </p>
                        <p className="text-destructive font-medium">
                          All entered org-level values and data owner assignments for this KPI will be deleted.
                        </p>
                      </div>
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction
                      disabled={isRemoving}
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async (e) => {
                        e.preventDefault();
                        setIsRemoving(true);
                        try {
                          await onRemoveFromOrg();
                        } finally {
                          setIsRemoving(false);
                        }
                      }}
                    >
                      {isRemoving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                      Confirm Remove
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
          {!isLocked && (
            <div className="flex items-center gap-2 flex-wrap">
              {saveStatus === 'saving' && (
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" />Saving...
                </span>
              )}
              {saveStatus === 'saved' && (
                <span className="text-xs text-primary flex items-center gap-1">
                  <CheckCircle2 className="h-3 w-3" />Saved
                </span>
              )}

              {/* Propagate Selected button — only when selections exist */}
              {selectedScopeIds.length > 0 && data.scope !== 'organization' && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="sm" variant="outline" className="h-7 text-xs gap-1" disabled={isPropagating}>
                      {isPropagating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5" />}
                      Propagate Selected ({selectedScopeIds.length})
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Propagate Selected</AlertDialogTitle>
                      <AlertDialogDescription>
                        This will propagate values for {selectedScopeIds.length} selected {data.scopeLabel?.toLowerCase() || 'scope'}(s) to employee scorecards.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    {/* Sent-back warning */}
                    {effectiveSentBackMap && selectedScopeIds.some(id => effectiveSentBackMap?.has(id)) && (
                      <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 py-2">
                        <Undo2 className="h-4 w-4 text-amber-600" />
                        <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                          <p className="font-medium mb-1">The following have KPIs that were sent back:</p>
                          <ul className="list-disc pl-4 space-y-0.5">
                            {selectedScopeIds.filter(id => effectiveSentBackMap?.has(id)).map(id => {
                              const row = scopedValues.find(r => r.scopeId === id);
                              const info = effectiveSentBackMap?.get(id);
                              return <li key={id}>{row?.scopeName || id} — {info?.reason}</li>;
                            })}
                          </ul>
                          <p className="mt-1">Propagating will overwrite their current review data.</p>
                        </AlertDescription>
                      </Alert>
                    )}
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleSaveAndPropagate(selectedScopeIds)}>
                        Propagate Selected
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}

              {/* Main Propagate All button */}
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button size="sm" className="h-7 text-xs" disabled={isPropagating || !(data.scope === 'organization' ? (isNa || achievedValue.trim() !== '') : (isNa || scopedValues.some(sv => sv.achievedValue !== null || sv.isNa)))}>
                    {isPropagating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5 mr-1" />}
                    Propagate
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm Propagation</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will update scores for {data.employeeCount || 0} employee scorecard{(data.employeeCount || 0) !== 1 ? 's' : ''}. 
                      The entry will be <strong>locked for editing</strong> afterward. Only an admin can unlock it.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  {/* Sent-back warning for bulk propagation */}
                  {effectiveSentBackMap && effectiveSentBackMap.size > 0 && data.scope !== 'organization' && (
                    <Alert variant="default" className="border-amber-500/50 bg-amber-50 dark:bg-amber-950/30 py-2">
                      <Undo2 className="h-4 w-4 text-amber-600" />
                      <AlertDescription className="text-xs text-amber-700 dark:text-amber-400">
                        <p className="font-medium mb-1">{effectiveSentBackMap?.size} employee(s) have KPIs that were sent back:</p>
                        <ul className="list-disc pl-4 space-y-0.5">
                          {Array.from(effectiveSentBackMap.entries()).slice(0, 5).map(([id, info]) => {
                            const row = scopedValues.find(r => r.scopeId === id);
                            return <li key={id}>{row?.scopeName || id} — {info.reason}</li>;
                          })}
                          {effectiveSentBackMap?.size > 5 && <li>...and {effectiveSentBackMap?.size - 5} more</li>}
                        </ul>
                        <p className="mt-1">Propagating will overwrite their current review data.</p>
                      </AlertDescription>
                    </Alert>
                  )}
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={() => handleSaveAndPropagate()}>
                      Propagate to Scorecards
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>
          )}
        </div>
      </CardContent>
    </Card>

    {isAdmin && (
      <OrgKpiOwnerDialog
        open={showOwnerDialog}
        onOpenChange={setShowOwnerDialog}
        categoryId={data.categoryId}
        kraName={data.kraName}
        kpiName={data.kpiName}
      />
    )}
    </>
  );
}
