/**
 * ADR-302 — admin configuration of the central approval ladder.
 *
 * Registers a KPI as central, picks the propagation mode and cut-off day, and
 * builds the ordered step list. Each step is either a named person or a role.
 * Steps are written under an effective-from date, so past decisions keep the
 * chain they were taken under (`org_kpi_chain_upsert`).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { EmployeeCombobox, type EmployeeOption } from '@/components/admin/EmployeeCombobox';
import { useProfiles } from '@/hooks/useOrganization';
import { useOrgKpiChainUpsert } from '@/hooks/useOrgKpiCentralWorkflow';
import type { CentralChainConfig } from '@/hooks/useOrgKpiCentralWorkflow';
import type { CentralPropagationMode } from '@/lib/review/centralApprovalModel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  categoryId: string;
  kraName: string;
  kpiName: string;
  config: CentralChainConfig | undefined;
}

interface DraftStep {
  key: string;
  label: string;
  kind: 'provider' | 'approver';
  actorType: 'person' | 'role';
  approverId: string;
  approverRole: string;
}

const ROLE_OPTIONS = [
  'manager', 'skip_level', 'hr_pms', 'auditor', 'management', 'admin',
] as const;

const DEFAULT_LADDER: Array<Pick<DraftStep, 'label' | 'kind' | 'actorType' | 'approverRole'>> = [
  { label: 'Data provider', kind: 'provider', actorType: 'role', approverRole: 'admin' },
  { label: 'RM1', kind: 'approver', actorType: 'role', approverRole: 'manager' },
  { label: 'RM2', kind: 'approver', actorType: 'role', approverRole: 'skip_level' },
  { label: 'HR / Audit', kind: 'approver', actorType: 'role', approverRole: 'hr_pms' },
  { label: 'Management', kind: 'approver', actorType: 'role', approverRole: 'management' },
];

const newKey = () => Math.random().toString(36).slice(2);
const todayIso = () => new Date().toISOString().slice(0, 10);

export function CentralChainConfigDialog({
  open, onOpenChange, categoryId, kraName, kpiName, config,
}: Props) {
  const upsert = useOrgKpiChainUpsert();
  const { data: profiles } = useProfiles({ enabled: open });
  const [mode, setMode] = useState<CentralPropagationMode>('central_fed');
  const [cutoffDay, setCutoffDay] = useState('');
  const [effectiveFrom, setEffectiveFrom] = useState(todayIso());
  const [steps, setSteps] = useState<DraftStep[]>([]);

  useEffect(() => {
    if (!open) return;
    setMode(config?.propagation_mode ?? 'central_fed');
    setCutoffDay(config?.cutoff_day ? String(config.cutoff_day) : '');
    setEffectiveFrom(todayIso());
    setSteps(
      config && config.steps.length > 0
        ? config.steps.map(s => ({
            key: s.id,
            label: s.label,
            kind: s.step_kind,
            actorType: s.approver_id ? 'person' : 'role',
            approverId: s.approver_id ?? '',
            approverRole: s.approver_role ?? 'manager',
          }))
        : DEFAULT_LADDER.map(d => ({ ...d, key: newKey(), approverId: '' })),
    );
  }, [open, config]);

  const employees: EmployeeOption[] = useMemo(
    () =>
      (profiles ?? [])
        .filter((p: any) => p.is_active !== false)
        .map((p: any) => ({
          id: p.id,
          name: p.full_name ?? '—',
          code: p.employee_code ?? '',
          department: p.departments?.name ?? '',
        })),
    [profiles],
  );

  const update = (key: string, patch: Partial<DraftStep>) =>
    setSteps(prev => prev.map(s => (s.key === key ? { ...s, ...patch } : s)));

  const invalid = steps.some(
    s => s.label.trim() === '' || (s.actorType === 'person' ? !s.approverId : !s.approverRole),
  );

  const save = async () => {
    if (invalid) return;
    await upsert.mutateAsync({
      categoryId,
      kraName,
      kpiName,
      propagationMode: mode,
      cutoffDay: cutoffDay.trim() === '' ? null : Number(cutoffDay),
      effectiveFrom,
      steps: steps.map((s, i) => ({
        step_no: i + 1,
        step_kind: s.kind,
        label: s.label.trim(),
        approver_id: s.actorType === 'person' ? s.approverId : null,
        approver_role: s.actorType === 'role' ? s.approverRole : null,
      })),
    });
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Central approval setup</DialogTitle>
          <DialogDescription>{kraName} · {kpiName}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="central-mode">What happens on final approval</Label>
            <Select value={mode} onValueChange={v => setMode(v as CentralPropagationMode)}>
              <SelectTrigger id="central-mode"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="central_fed">
                  Value only — each employee's review continues as usual
                </SelectItem>
                <SelectItem value="central_approved">
                  Value + close the reviewer stages for mapped employees
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="central-cutoff">Cut-off day (optional)</Label>
            <Input
              id="central-cutoff"
              inputMode="numeric"
              value={cutoffDay}
              placeholder="e.g. 5"
              onChange={e => setCutoffDay(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="central-effective">Effective from</Label>
            <Input
              id="central-effective"
              type="date"
              value={effectiveFrom}
              onChange={e => setEffectiveFrom(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <Label>Approval steps (in order)</Label>
            <Button
              variant="outline"
              className="h-10"
              onClick={() =>
                setSteps(prev => [
                  ...prev,
                  { key: newKey(), label: `Step ${prev.length + 1}`, kind: 'approver',
                    actorType: 'role', approverId: '', approverRole: 'manager' },
                ])
              }
            >
              <Plus className="mr-2 h-4 w-4" aria-hidden />
              Add step
            </Button>
          </div>

          {steps.map((s, i) => (
            <div key={s.key} className="grid items-end gap-2 rounded-md border p-3 sm:grid-cols-[2.5rem_1fr_9rem_1fr_2.5rem]">
              <span className="pb-2 text-sm font-semibold text-muted-foreground">{i + 1}</span>
              <div className="space-y-1">
                <Label htmlFor={`step-label-${s.key}`} className="text-xs">Label</Label>
                <Input
                  id={`step-label-${s.key}`}
                  value={s.label}
                  onChange={e => update(s.key, { label: e.target.value })}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Actor</Label>
                <Select
                  value={s.actorType}
                  onValueChange={v => update(s.key, { actorType: v as 'person' | 'role' })}
                >
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="person">Named person</SelectItem>
                    <SelectItem value="role">Role</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">
                  {s.actorType === 'person' ? 'Person' : 'Role'}
                </Label>
                {s.actorType === 'person' ? (
                  <EmployeeCombobox
                    employees={employees}
                    value={s.approverId}
                    onChange={id => update(s.key, { approverId: id })}
                    placeholder="Select person"
                  />
                ) : (
                  <Select
                    value={s.approverRole}
                    onValueChange={v => update(s.key, { approverRole: v })}
                  >
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {ROLE_OPTIONS.map(r => (
                        <SelectItem key={r} value={r}>{r.replace(/_/g, ' ')}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              </div>
              <Button
                variant="ghost"
                className="h-10 w-10 p-0"
                onClick={() => setSteps(prev => prev.filter(p => p.key !== s.key))}
              >
                <Trash2 className="h-4 w-4 text-destructive" aria-hidden />
                <span className="sr-only">Remove step {i + 1}</span>
              </Button>
            </div>
          ))}

          <p className="text-xs text-muted-foreground">
            Step 1 is the data provider. Everything after it is an approver, in order. Saving under a
            new effective-from date leaves decisions already taken untouched.
          </p>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" className="h-10" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button className="h-10" onClick={save} disabled={invalid || upsert.isPending}>
            {upsert.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden />}
            Save chain
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
