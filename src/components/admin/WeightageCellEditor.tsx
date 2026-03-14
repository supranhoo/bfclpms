import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

const MONTH_ORDER = ['July', 'August', 'September', 'October', 'November', 'December', 'January', 'February', 'March', 'April', 'May', 'June'];

type Scope = 'this' | 'forward' | 'all';

interface WeightageCellEditorProps {
  children: React.ReactNode;
  employeeId: string;
  kraName: string;
  kpiName: string;
  month: string;
  currentWeightage: number | null;
  kpiIds: Record<string, string>; // month -> kpi id
  onSuccess: () => void;
}

export function WeightageCellEditor({
  children,
  employeeId,
  kraName,
  kpiName,
  month,
  currentWeightage,
  kpiIds,
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

  const getTargetKpiIds = (): string[] => {
    const currentIdx = MONTH_ORDER.indexOf(month);
    if (currentIdx === -1) return [kpiIds[month]].filter(Boolean);

    if (scope === 'this') {
      return kpiIds[month] ? [kpiIds[month]] : [];
    }

    if (scope === 'all') {
      return Object.values(kpiIds).filter(Boolean);
    }

    // forward: this month + all following months in fiscal year order
    const ids: string[] = [];
    for (let i = currentIdx; i < MONTH_ORDER.length; i++) {
      const m = MONTH_ORDER[i];
      if (kpiIds[m]) ids.push(kpiIds[m]);
    }
    return ids;
  };

  const handleSave = async () => {
    const newWeightage = value === '' ? null : Number(value);
    if (value !== '' && isNaN(newWeightage!)) {
      toast.error('Please enter a valid number');
      return;
    }

    const ids = getTargetKpiIds();
    if (ids.length === 0) {
      toast.error('No KPI records found for the selected scope');
      return;
    }

    setSaving(true);
    try {
      const { error } = await supabase
        .from('kpis')
        .update({ weightage: newWeightage, updated_at: new Date().toISOString() })
        .in('id', ids);

      if (error) throw error;

      // Log audit entries
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const auditRows = ids.map(kpiId => ({
          kpi_id: kpiId,
          performed_by: user.id,
          action: 'weightage_matrix_edit',
          old_value: { weightage: currentWeightage } as any,
          new_value: { weightage: newWeightage } as any,
          metadata: { scope, from_month: month, affected_count: ids.length } as any,
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
              <Label htmlFor="scope-forward" className="text-xs cursor-pointer">This & all following months</Label>
            </div>
            <div className="flex items-center gap-2">
              <RadioGroupItem value="all" id="scope-all" />
              <Label htmlFor="scope-all" className="text-xs cursor-pointer">All months</Label>
            </div>
          </RadioGroup>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Will update <strong>{getTargetKpiIds().length}</strong> month(s)
        </p>
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={handleSave} disabled={saving}>
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
