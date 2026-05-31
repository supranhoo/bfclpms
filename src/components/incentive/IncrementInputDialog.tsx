import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { EmployeeCombobox, type EmployeeOption } from '@/components/admin/EmployeeCombobox';
import { useUpsertIncrementInput, type IncrementInputRow } from '@/hooks/useIncrementInputs';
import { Loader2, AlertCircle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assessmentYear: string;
  employees: EmployeeOption[];
  existing?: IncrementInputRow & { employee?: { full_name?: string; employee_code?: string } } | null;
  /** Employee IDs that already have an input for this AY — used to warn in Add mode. */
  existingEmployeeIds?: Set<string>;
}

type Form = {
  employee_id: string;
  absent_days: string;
  lwp_days: string;
  disciplinary_actions: string;
  training_compliance: string;
  current_salary: string;
  remarks: string;
};

const blank: Form = {
  employee_id: '',
  absent_days: '0',
  lwp_days: '0',
  disciplinary_actions: '0',
  training_compliance: '0',
  current_salary: '',
  remarks: '',
};

export function IncrementInputDialog({
  open, onOpenChange, assessmentYear, employees, existing, existingEmployeeIds,
}: Props) {
  const isEdit = !!existing;
  const [form, setForm] = useState<Form>(blank);
  const upsert = useUpsertIncrementInput();
  const { toast } = useToast();

  useEffect(() => {
    if (!open) return;
    if (existing) {
      setForm({
        employee_id: existing.employee_id,
        absent_days: String(existing.absent_days ?? 0),
        lwp_days: String(existing.lwp_days ?? 0),
        disciplinary_actions: String(existing.disciplinary_actions ?? 0),
        training_compliance: String(existing.training_compliance ?? 0),
        current_salary: existing.current_salary != null ? String(existing.current_salary) : '',
        remarks: existing.remarks ?? '',
      });
    } else {
      setForm(blank);
    }
  }, [open, existing]);

  const set = (k: keyof Form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const employeeLabel = isEdit
    ? `${existing?.employee?.full_name ?? '—'}${existing?.employee?.employee_code ? ` (${existing.employee.employee_code})` : ''}`
    : '';
  const willOverwrite = !isEdit && form.employee_id && existingEmployeeIds?.has(form.employee_id);

  const parseNonNeg = (s: string, label: string): number => {
    const n = Number(s);
    if (!Number.isFinite(n) || n < 0) throw new Error(`${label} must be a number ≥ 0`);
    return n;
  };

  const handleSave = async () => {
    try {
      if (!form.employee_id) throw new Error('Please select an employee');
      const payload = {
        employee_id: form.employee_id,
        assessment_year: assessmentYear,
        absent_days: parseNonNeg(form.absent_days, 'Absent Days'),
        lwp_days: parseNonNeg(form.lwp_days, 'LWP Days'),
        disciplinary_actions: parseNonNeg(form.disciplinary_actions, 'Disciplinary Actions'),
        training_compliance: parseNonNeg(form.training_compliance, 'Training Compliance'),
        current_salary:
          form.current_salary.trim() === '' ? null : parseNonNeg(form.current_salary, 'Current Salary'),
        remarks: form.remarks.trim() || null,
        source: (isEdit ? existing!.source : 'manual') as 'manual' | 'import' | 'bulk',
      };
      await upsert.mutateAsync(payload);
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: 'Validation error', description: e?.message ?? 'Invalid input', variant: 'destructive' });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Increment Input' : 'Add Increment Input'}</DialogTitle>
          <DialogDescription>
            Assessment Year <Badge variant="secondary" className="ml-1">AY {assessmentYear}</Badge>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Employee</Label>
            {isEdit ? (
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">{employeeLabel}</div>
            ) : (
              <EmployeeCombobox
                employees={employees}
                value={form.employee_id}
                onChange={(id) => set('employee_id')(id)}
                placeholder="Search employee by name or code…"
              />
            )}
            {willOverwrite && (
              <div className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                Existing entry for this employee in AY {assessmentYear} will be updated.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Absent Days" value={form.absent_days} onChange={set('absent_days')} />
            <Field label="LWP Days" value={form.lwp_days} onChange={set('lwp_days')} />
            <Field label="Disciplinary Actions" value={form.disciplinary_actions} onChange={set('disciplinary_actions')} />
            <Field label="Training Compliance" value={form.training_compliance} onChange={set('training_compliance')} />
            <div className="col-span-2">
              <Field label="Current Salary (optional)" value={form.current_salary} onChange={set('current_salary')} placeholder="Leave blank if not applicable" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Remarks</Label>
            <Textarea
              value={form.remarks}
              onChange={(e) => set('remarks')(e.target.value)}
              rows={2}
              placeholder="Optional notes"
              maxLength={500}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={upsert.isPending}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={upsert.isPending}>
            {upsert.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? 'Save Changes' : 'Add Input'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label, value, onChange, placeholder,
}: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type="number"
        min={0}
        step="any"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}