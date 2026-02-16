import { useState, useEffect, useRef, useCallback } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { OrgKpiFileUpload } from '@/components/admin/OrgKpiFileUpload';
import { OrgKpiAuditLog } from '@/components/admin/OrgKpiAuditLog';
import { OrgKpiScopedEntryTable, ScopedRow } from '@/components/admin/OrgKpiScopedEntryTable';
import { Save, Loader2, CheckCircle2, Clock, ArrowUpRight, Building2, Users, User, BarChart3 } from 'lucide-react';

export interface OrgKpiCardData {
  categoryId: string;
  categoryName: string;
  categoryColor: string;
  kraName: string;
  kpiName: string;
  targetValue: number | null;
  uom: string | null;
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
}

interface OrgKpiEntryCardProps {
  data: OrgKpiCardData;
  reviewPeriod: string;
  reviewYear: number;
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

export function OrgKpiEntryCard({ data, reviewPeriod, reviewYear, onSave, onSaveAndPropagate, onOpenImpact }: OrgKpiEntryCardProps) {
  const [achievedValue, setAchievedValue] = useState<string>(data.achievedValue?.toString() ?? '');
  const [remarks, setRemarks] = useState(data.remarks);
  const [evidenceUrl, setEvidenceUrl] = useState(data.evidenceUrl);
  const [scopedValues, setScopedValues] = useState<ScopedRow[]>(data.scopedRows || []);
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

  const getValues = useCallback(() => {
    const parsed = achievedValue === '' ? null : parseFloat(achievedValue);
    return {
      achievedValue: isNaN(parsed as number) ? null : parsed,
      remarks,
      evidenceUrl,
      scopedValues: data.scope !== 'organization'
        ? scopedValues.map(s => ({
            scopeId: s.scopeId,
            achievedValue: s.achievedValue,
            remarks: s.remarks,
            evidenceUrl: s.evidenceUrl,
          }))
        : undefined,
    };
  }, [achievedValue, remarks, evidenceUrl, scopedValues, data.scope]);

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
    <Card className={`transition-all ${isDirtyRef.current ? 'ring-1 ring-primary/30' : ''}`}>
      <CardContent className="p-4 space-y-3">
        {/* Header */}
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold truncate">{data.kpiName}</h3>
            <p className="text-xs text-muted-foreground truncate">KRA: {data.kraName}</p>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <Badge variant={statusInfo.variant} className={`gap-1 text-xs ${statusInfo.className}`}>
              <StatusIcon className="h-3 w-3" />
              {statusInfo.label}
            </Badge>
          </div>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
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
          {data.previousValue !== null && data.previousPeriodLabel && (
            <span>
              Prev ({data.previousPeriodLabel}): <span className="font-medium text-foreground">{data.previousValue}</span>
            </span>
          )}
        </div>

        {/* Input area - org scope */}
        {data.scope === 'organization' && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <Input
                type="number"
                value={achievedValue}
                onChange={(e) => { setAchievedValue(e.target.value); triggerAutoSave(); }}
                placeholder="Achieved value"
                className="h-9"
              />
            </div>
            <div>
              <Input
                value={remarks}
                onChange={(e) => { setRemarks(e.target.value); triggerAutoSave(); }}
                placeholder="Remark"
                className="h-9"
              />
            </div>
            <div className="flex items-center gap-2">
              <OrgKpiFileUpload
                existingUrl={evidenceUrl}
                onUploadComplete={(url) => { setEvidenceUrl(url); triggerAutoSave(); }}
              />
            </div>
          </div>
        )}

        {/* Scoped entry table for dept/employee */}
        {data.scope !== 'organization' && data.scopeLabel && (
          <OrgKpiScopedEntryTable
            rows={scopedValues}
            onValueChange={handleScopedChange}
            scopeLabel={data.scopeLabel}
          />
        )}

        {/* Actions */}
        <div className="flex items-center justify-between pt-1 border-t">
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
          </div>
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
            <Button size="sm" className="h-7 text-xs" onClick={handleSaveAndPropagate} disabled={isPropagating}>
              {isPropagating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ArrowUpRight className="h-3.5 w-3.5 mr-1" />}
              Save & Propagate
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
