import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { OrgKpiFileUpload } from '@/components/admin/OrgKpiFileUpload';
import { OrgKpiAuditLog } from '@/components/admin/OrgKpiAuditLog';
import { OrgKpiScopedEntryTable, ScopedRow } from '@/components/admin/OrgKpiScopedEntryTable';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { isValueOutOfRange, RatingThresholds } from '@/lib/ratingCalculation';
import { Textarea } from '@/components/ui/textarea';
import { Save, Loader2, CheckCircle2, Clock, ArrowUpRight, Building2, Users, User, BarChart3, Lock, Unlock, AlertTriangle, RotateCcw } from 'lucide-react';

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
}

interface OrgKpiEntryCardProps {
  data: OrgKpiCardData;
  reviewPeriod: string;
  reviewYear: number;
  isAdmin?: boolean;
  onSave: (values: {
    achievedValue: number | null;
    remarks: string;
    evidenceUrl: string | null;
    scopedValues?: Array<{ scopeId: string; achievedValue: number | null; remarks: string; evidenceUrl: string | null }>;
  }) => Promise<void>;
  onSaveAndPropagate: (values: {
    achievedValue: number | null;
    remarks: string;
    evidenceUrl: string | null;
    scopedValues?: Array<{ scopeId: string; achievedValue: number | null; remarks: string; evidenceUrl: string | null }>;
  }) => Promise<void>;
  onUnlock?: () => Promise<void>;
  onRollback?: (reason: string) => Promise<void>;
  onOpenImpact: () => void;
}

const statusConfig = {
  pending: { label: 'Pending', icon: Clock, variant: 'outline' as const, className: 'text-muted-foreground' },
  entered: { label: 'Entered', icon: CheckCircle2, variant: 'secondary' as const, className: 'text-primary' },
  propagated: { label: 'Propagated', icon: ArrowUpRight, variant: 'default' as const, className: 'text-green-600' },
};

const scopeIcons = {
  organization: Building2,
  department: Users,
  employee: User,
};

export function OrgKpiEntryCard({ data, reviewPeriod, reviewYear, isAdmin, onSave, onSaveAndPropagate, onUnlock, onRollback, onOpenImpact }: OrgKpiEntryCardProps) {
  const isLocked = data.status === 'propagated' && !isAdmin;
  const isPropagated = data.status === 'propagated';
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [isRollingBack, setIsRollingBack] = useState(false);
  const [rollbackReason, setRollbackReason] = useState('');
  const [achievedValue, setAchievedValue] = useState<string>(data.achievedValue?.toString() ?? '');
  const [remarks, setRemarks] = useState(data.remarks);
  const [evidenceUrl, setEvidenceUrl] = useState(data.evidenceUrl);
  const [scopedValues, setScopedValues] = useState<ScopedRow[]>(data.scopedRows || []);

  // Refs to always access latest values (fixes stale closure in auto-save)
  const achievedValueRef = useRef(achievedValue);
  const remarksRef = useRef(remarks);
  const evidenceUrlRef = useRef(evidenceUrl);
  const scopedValuesRef = useRef(scopedValues);

  useEffect(() => { achievedValueRef.current = achievedValue; }, [achievedValue]);
  useEffect(() => { remarksRef.current = remarks; }, [remarks]);
  useEffect(() => { evidenceUrlRef.current = evidenceUrl; }, [evidenceUrl]);
  useEffect(() => { scopedValuesRef.current = scopedValues; }, [scopedValues]);

  const [isSaving, setIsSaving] = useState(false);
  const [isPropagating, setIsPropagating] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isDirtyRef = useRef(false);

  // Sync from props when data changes (e.g. after refetch)
  useEffect(() => {
    setAchievedValue(data.achievedValue?.toString() ?? '');
    setRemarks(data.remarks);
    setEvidenceUrl(data.evidenceUrl);
    setScopedValues(data.scopedRows || []);
    isDirtyRef.current = false;
    setSaveStatus('idle');
  }, [data.achievedValue, data.remarks, data.evidenceUrl, data.scopedRows]);

  // getValues reads from refs (always current, no stale closure)
  const getValues = useCallback(() => {
    const parsed = achievedValueRef.current === '' ? null : parseFloat(achievedValueRef.current);
    return {
      achievedValue: isNaN(parsed as number) ? null : parsed,
      remarks: remarksRef.current,
      evidenceUrl: evidenceUrlRef.current,
      scopedValues: data.scope !== 'organization'
        ? scopedValuesRef.current.map(s => ({
            scopeId: s.scopeId,
            achievedValue: s.achievedValue,
            remarks: s.remarks,
            evidenceUrl: s.evidenceUrl,
          }))
        : undefined,
    };
  }, [data.scope]);

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

  const handleManualSave = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsSaving(true);
    try {
      await onSave(getValues());
      isDirtyRef.current = false;
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus('idle'), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  const handleSaveAndPropagate = async () => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    setIsPropagating(true);
    try {
      await onSaveAndPropagate(getValues());
      isDirtyRef.current = false;
      setSaveStatus('saved');
    } finally {
      setIsPropagating(false);
    }
  };

  const handleScopedChange = (scopeId: string, field: 'achievedValue' | 'remarks' | 'evidenceUrl', value: string | null) => {
    setScopedValues(prev => prev.map(r => {
      if (r.scopeId !== scopeId) return r;
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
    <Card className={`transition-all min-w-0 overflow-hidden ${isDirtyRef.current ? 'ring-1 ring-primary/30' : ''}`}>
      <CardContent className="p-4 space-y-3">
        {/* Two-column layout: Info (left) | Inputs+Actions (right) */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* LEFT COLUMN (40%) - KPI Info */}
          <div className="md:col-span-2 space-y-2 min-w-0">
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
              <Badge variant={statusInfo.variant} className={`gap-1 text-xs ${statusInfo.className}`}>
                <StatusIcon className="h-3 w-3" />
                {statusInfo.label}
              </Badge>
              {data.employeeCount !== undefined && data.employeeCount > 0 && (
                <Badge variant="outline" className="gap-1 text-xs">
                  <Users className="h-3 w-3" />
                  {data.employeeCount} employee{data.employeeCount !== 1 ? 's' : ''}
                </Badge>
              )}
            </div>
          </div>

          {/* RIGHT COLUMN (60%) - Inputs & Actions */}
          <div className="md:col-span-3 space-y-3 min-w-0">
            {/* Input area - org scope */}
            {data.scope === 'organization' && (
              <div className="space-y-2">
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

            {/* Lock banner */}
            {isLocked && (
              <div className="flex items-center gap-2 p-2 rounded-md bg-muted text-sm text-muted-foreground">
                <Lock className="h-4 w-4 shrink-0" />
                <span>Locked after propagation. Contact admin to unlock.</span>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t">
              <div className="flex items-center gap-2">
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
              </div>
              {!isLocked && (
                <div className="flex items-center gap-2">
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
                  <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleManualSave} disabled={isSaving}>
                    {isSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5 mr-1" />}
                    Save
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button size="sm" className="h-7 text-xs" disabled={isPropagating}>
                        {isPropagating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5 mr-1" />}
                        Save & Propagate
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
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={handleSaveAndPropagate}>
                          Confirm & Propagate
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Scoped entry table for dept/employee - full width below both columns */}
        {data.scope !== 'organization' && data.scopeLabel && (
          <OrgKpiScopedEntryTable
            rows={scopedValues}
            onValueChange={handleScopedChange}
            scopeLabel={data.scopeLabel}
          />
        )}
      </CardContent>
    </Card>
  );
}
