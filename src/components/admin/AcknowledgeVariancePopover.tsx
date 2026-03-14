import { useState } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface AcknowledgeVariancePopoverProps {
  isAcknowledged: boolean;
  kpiIds: Record<string, string>; // month -> kpi id (all months for this KPI row)
  kpiName: string;
  onSuccess: () => void;
}

export function AcknowledgeVariancePopover({
  isAcknowledged,
  kpiIds,
  kpiName,
  onSuccess,
}: AcknowledgeVariancePopoverProps) {
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleToggle = async () => {
    const ids = Object.values(kpiIds).filter(Boolean);
    if (ids.length === 0) return;

    const newValue = !isAcknowledged;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('kpis')
        .update({ weightage_variance_acknowledged: newValue, updated_at: new Date().toISOString() })
        .in('id', ids);
      if (error) throw error;

      // Audit log
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        const auditRows = ids.map(kpiId => ({
          kpi_id: kpiId,
          performed_by: user.id,
          action: 'weightage_variance_acknowledged',
          old_value: { acknowledged: isAcknowledged } as any,
          new_value: { acknowledged: newValue } as any,
          metadata: { affected_count: ids.length } as any,
        }));
        await supabase.from('kpi_audit_logs').insert(auditRows);
      }

      toast.success(newValue ? 'Variance marked as intentional' : 'Variance acknowledgement removed');
      setOpen(false);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to update');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-5 w-5 p-0.5 rounded hover:bg-muted transition-colors"
          title={isAcknowledged ? 'Variance acknowledged (click to undo)' : 'Unacknowledged variance (click to acknowledge)'}
          onClick={(e) => e.stopPropagation()}
        >
          {isAcknowledged ? (
            <CheckCircle2 className="h-3.5 w-3.5 text-amber-500" />
          ) : (
            <AlertTriangle className="h-3.5 w-3.5 text-destructive" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-3 space-y-2" align="center">
        <p className="text-xs text-muted-foreground">
          {isAcknowledged
            ? 'This variance is marked as intentional. Remove acknowledgement?'
            : 'Mark this weightage variance as intentional?'}
        </p>
        <p className="text-[11px] font-medium truncate" title={kpiName}>{kpiName}</p>
        <Button size="sm" className="w-full" onClick={handleToggle} disabled={saving}>
          {saving ? 'Saving...' : isAcknowledged ? 'Remove Acknowledgement' : 'Acknowledge Variance'}
        </Button>
      </PopoverContent>
    </Popover>
  );
}
