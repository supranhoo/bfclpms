import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

// Fiscal-order month list (Jul→Jun) used for iterating cells in the row.
const MONTH_ORDER = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];
// Calendar-order index used for calendar-time comparisons (past vs future).
const CAL_MONTH_INDEX: Record<string, number> = {
  January: 0, February: 1, March: 2, April: 3, May: 4, June: 5,
  July: 6, August: 7, September: 8, October: 9, November: 10, December: 11,
};

type Scope = 'this' | 'forward' | 'all';

interface WeightageCellEditorProps {
  children: React.ReactNode;
  employeeId: string;
  kraName: string;
  kpiName: string;
  month: string;
  currentWeightage: number | null;
  kpiIds: Record<string, string>; // month -> kpi id
  kpiMonthYears: Record<string, number>; // month -> review_year for calendar-time gating
  onSuccess: () => void;
}

/**
 * POLICY §KPI Weightage Governance — bulk-edit scope semantics.
 *
 * `forward` and `all` are CALENDAR-forward: they must never modify a month
 * whose (year, monthIdx) is strictly before today's (year, monthIdx). The
 * escape hatch for historical corrections is the single-month `this` scope
 * (governed elsewhere by lock / variance-ack rules).
 */
export function computeTargetKpiIds(
  scope: Scope,
  clickedMonth: string,
  kpiIds: Record<string, string>,
  kpiMonthYears: Record<string, number>,
  now: Date,
): string[] {
  if (scope === 'this') {
    return kpiIds[clickedMonth] ? [kpiIds[clickedMonth]] : [];
  }

  const todayYear = now.getFullYear();
  const todayMonthIdx = now.getMonth(); // 0..11 calendar

  const isNotPast = (m: string): boolean => {
    const y = kpiMonthYears[m];
    const mIdx = CAL_MONTH_INDEX[m];
    if (y == null || mIdx == null) return false;
    if (y > todayYear) return true;
    if (y < todayYear) return false;
    return mIdx >= todayMonthIdx;
  };

  if (scope === 'all') {
    const ids: string[] = [];
    for (const m of MONTH_ORDER) {
      if (kpiIds[m] && isNotPast(m)) ids.push(kpiIds[m]);
    }
    return ids;
  }

  // forward: anchor = max(clickedMonth, today)
  const clickedYear = kpiMonthYears[clickedMonth];
  const clickedIdx = CAL_MONTH_INDEX[clickedMonth];
  let anchorYear = todayYear;
  let anchorIdx = todayMonthIdx;
  if (
    clickedYear != null &&
    clickedIdx != null &&
    (clickedYear > todayYear || (clickedYear === todayYear && clickedIdx > todayMonthIdx))
  ) {
    anchorYear = clickedYear;
    anchorIdx = clickedIdx;
  }

  const ids: string[] = [];
  for (const m of MONTH_ORDER) {
    if (!kpiIds[m]) continue;
    const y = kpiMonthYears[m];
    const mIdx = CAL_MONTH_INDEX[m];
    if (y == null || mIdx == null) continue;
    const geAnchor =
      y > anchorYear || (y === anchorYear && mIdx >= anchorIdx);
    if (geAnchor) ids.push(kpiIds[m]);
  }
  return ids;
}

export function WeightageCellEditor({
  children,
  employeeId,
  kraName,
  kpiName,
  month,
  currentWeightage,
  kpiIds,
  kpiMonthYears,
  onSuccess,
}: WeightageCellEditorProps) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(String(currentWeightage ?? ''));
  const [scope, setScope] = useState<Scope>('all');
  const [saving, setSaving] = useState(false);

  const handleOpen = (isOpen: boolean) => {
    if (isOpen) setValue(String(currentWeightage ?? ''));
    setOpen(isOpen);
  };

  const getTargetKpiIds = (): string[] =>
    computeTargetKpiIds(scope, month, kpiIds, kpiMonthYears, new Date());

  const handleSave = async () => {
    const newWeightage = value === '' ? null : Number(value);
    if (value !== '' && isNaN(newWeightage!)) {
      toast.error('Please enter a valid number');
      return;
    }

    const ids = getTargetKpiIds();
    if (ids.length === 0) {
      toast.error('No editable current/future months for this scope');
      return;
    }

    setSaving(true);
    try {
      const updatePayload: any = { weightage: newWeightage, updated_at: new Date().toISOString() };
      // Reset acknowledgement when creating a potential new variance
      if (scope === 'this' || scope === 'forward') {
        const allIds = Object.values(kpiIds).filter(Boolean);
        if (allIds.length > 0) {
          await supabase
            .from('kpis')
            .update({ weightage_variance_acknowledged: false, updated_at: new Date().toISOString() })
            .in('id', allIds);
        }
      }
      const { error } = await supabase
        .from('kpis')
        .update(updatePayload)
        .in('id', ids);

      if (error) throw error;

      // Log audit entries
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const now = new Date();
        const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        const auditRows = ids.map(kpiId => ({
          kpi_id: kpiId,
          performed_by: user.id,
          action: 'weightage_matrix_edit',
          old_value: { weightage: currentWeightage } as any,
          new_value: { weightage: newWeightage } as any,
          metadata: { scope, from_month: month, affected_count: ids.length, today } as any,
        }));
        await supabase.from('kpi_audit_logs').insert(auditRows);
      }

      toast.success(`Weightage updated for ${ids.length} month(s)`);
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update weightage');
    } finally {
      setSaving(false);
    }
  };

  const targetCount = getTargetKpiIds().length;
  const disableSave = saving || targetCount === 0;

  return (
    <Popover open={open} onOpenChange={handleOpen} modal={false}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-64 p-4 space-y-3" align="center">
        <div className="space-y-1">
          <Label className="text-xs font-medium">New Weightage (%)</Label>
          <Input
            type="number"
            min={0}
            max={100}
            step={1}
            value={value}
            onChange={e => setValue(e.target.value)}
            className="h-8"
            autoFocus
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs font-medium">Apply to</Label>
          <RadioGroup value={scope} onValueChange={v => setScope(v as Scope)} className="gap-1.5">
            <div className="flex items-center gap-2">
              <RadioGroupItem value="this" id="scope-this" />
              <Label htmlFor="scope-this" className="text-xs cursor-pointer">This month only</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="forward" id="scope-forward" />
              <Label htmlFor="scope-forward" className="text-xs cursor-pointer">This & all following months (future only)</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="all" id="scope-all" />
              <Label htmlFor="scope-all" className="text-xs cursor-pointer">All current & future months</Label>
            </div>
          </RadioGroup>
          <p className="text-[10px] text-muted-foreground leading-tight pt-1">
            Past months are protected from bulk edits. Use “This month only” to edit a historical month.
          </p>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Will update <strong>{targetCount}</strong> month(s)
          {targetCount === 0 && scope !== 'this' && (
            <span className="block text-destructive/80">No editable current/future months for this scope.</span>
          )}
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleSave} disabled={disableSave}>
            {saving ? 'Saving...' : 'Save'}
          </Button>
          {currentWeightage != null && (
            <Button
              size="sm"
              variant="outline"
              className="text-destructive hover:text-destructive"
              disabled={saving}
              onClick={async () => {
                setValue('');
                setScope('this');
                // Trigger save with null weightage for this month only
                const ids = kpiIds[month] ? [kpiIds[month]] : [];
                if (ids.length === 0) return;
                setSaving(true);
                try {
                  const { error } = await supabase
                    .from('kpis')
                    .update({ weightage: null, updated_at: new Date().toISOString() })
                    .in('id', ids);
                  if (error) throw error;
                  const { data: { user } } = await supabase.auth.getUser();
                  if (user) {
                    await supabase.from('kpi_audit_logs').insert({
                      kpi_id: ids[0],
                      performed_by: user.id,
                      action: 'weightage_matrix_edit',
                      old_value: { weightage: currentWeightage } as any,
                      new_value: { weightage: null } as any,
                      metadata: { scope: 'this', from_month: month, affected_count: 1, action: 'remove' } as any,
                    });
                  }
                  toast.success('Weightage removed');
                  setOpen(false);
                  onSuccess();
                } catch (err: any) {
                  toast.error(err.message || 'Failed to remove weightage');
                } finally {
                  setSaving(false);
                }
              }}
            >
              Remove
            </Button>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
