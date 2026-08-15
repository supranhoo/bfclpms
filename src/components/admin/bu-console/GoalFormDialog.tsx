/**
 * ADR-263 — Goal editor for the BU Performance Console.
 *
 * A goal is a metric attached to a KPI definition for one scope: start,
 * target and current value, plus how it is tracked and how sub-periods
 * summarise into the headline number. Admin-only; writes go through
 * `bu_goal_upsert`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrgFilterCombobox } from '@/components/admin/OrgFilterCombobox';
import {
  useGoalUpsert,
  useKpiDefinitionOptions,
  GOAL_SUMMARY_RULE_LABELS,
  GOAL_TRACKING_LABELS,
  type BuGoalRow,
  type GoalEntityLevel,
  type GoalProgressType,
  type GoalSummaryRule,
  type GoalTrackingMethod,
  type GoalVisibility,
} from '@/hooks/useBuConsole';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  goal: BuGoalRow | null;
  year: number;
  period: string | null;
  buOptions: { value: string; label: string }[];
  deptOptions: { value: string; label: string }[];
}

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export function GoalFormDialog({ open, onOpenChange, goal, year, period, buOptions, deptOptions }: Props) {
  const upsert = useGoalUpsert();
  const [search, setSearch] = useState('');
  const { data: definitions } = useKpiDefinitionOptions(search, open);

  const [definitionId, setDefinitionId] = useState<string>('');
  const [entityLevel, setEntityLevel] = useState<GoalEntityLevel>('bu');
  const [buId, setBuId] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [scopePeriod, setScopePeriod] = useState<string>('');
  const [progressType, setProgressType] = useState<GoalProgressType>('number');
  const [tracking, setTracking] = useState<GoalTrackingMethod>('rollup');
  const [rule, setRule] = useState<GoalSummaryRule>('last');
  const [visibility, setVisibility] = useState<GoalVisibility>('public');
  const [unit, setUnit] = useState('');
  const [startValue, setStartValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setDefinitionId(goal?.definition_id ?? '');
    setEntityLevel(goal?.entity_level ?? 'bu');
    setBuId(goal?.business_unit_id ?? null);
    setDeptId(goal?.department_id ?? null);
    setScopePeriod(goal?.review_period ?? period ?? '');
    setProgressType(goal?.progress_type ?? 'number');
    setTracking(goal?.tracking_method ?? 'rollup');
    setRule(goal?.subperiod_summary_rule ?? 'last');
    setVisibility(goal?.visibility ?? 'public');
    setUnit(goal?.unit ?? '');
    setStartValue(goal?.start_value?.toString() ?? '');
    setTargetValue(goal?.target_value?.toString() ?? '');
    setCurrentValue(goal?.current_value?.toString() ?? '');
    setNotes('');
  }, [open, goal, period]);

  const definitionRows = definitions?.rows ?? [];
  const definitionTotal = definitions?.total ?? 0;
  /** ADR-264 — the picker is capped server-side; say so instead of hiding matches. */
  const definitionsTruncated = definitionTotal > definitionRows.length;

  const definitionOptions = useMemo(
    () => definitionRows.map(d => ({ value: d.id, label: `${d.kpi_name} — ${d.kra_name}` })),
    [definitionRows],
  );

  const canSave = !!definitionId && !upsert.isPending;

  const save = () => {
    upsert.mutate(
      {
        id: goal?.id ?? null,
        definitionId,
        reviewYear: year,
        reviewPeriod: scopePeriod.trim() === '' ? null : scopePeriod.trim(),
        entityLevel,
        businessUnitId: entityLevel === 'org' ? null : buId,
        departmentId: entityLevel === 'department' ? deptId : null,
        progressType,
        trackingMethod: tracking,
        subperiodSummaryRule: rule,
        visibility,
        unit: unit.trim() === '' ? null : unit.trim(),
        startValue: num(startValue),
        targetValue: num(targetValue),
        currentValue: tracking === 'manual' ? num(currentValue) : null,
        notes: notes.trim() === '' ? null : notes.trim(),
      },
      { onSuccess: (res) => { if (res.authorized && !res.error) onOpenChange(false); } },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{goal ? 'Edit goal' : 'New goal'}</DialogTitle>
          <DialogDescription>
            A goal points at one KPI definition for one scope. Employee scoring is unchanged —
            goals never overwrite review data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>KPI definition</Label>
            <Input
              placeholder="Search definitions…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <OrgFilterCombobox
              label=""
              value={definitionId}
              onValueChange={(v) => setDefinitionId(v ?? '')}
              options={definitionOptions}
              placeholder="Pick a definition"
            />
            {definitionsTruncated && (
              <p className="text-xs text-muted-foreground">
                Showing the first {definitionRows.length} of {definitionTotal} matching definitions — keep typing to narrow the list.
              </p>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Level</Label>
              <Select value={entityLevel} onValueChange={(v) => setEntityLevel(v as GoalEntityLevel)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="org">Organisation</SelectItem>
                  <SelectItem value="bu">Business unit</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Period (blank = whole year)</Label>
              <Input value={scopePeriod} onChange={(e) => setScopePeriod(e.target.value)} placeholder="e.g. August" />
            </div>
          </div>

          {entityLevel !== 'org' && (
            <div className="grid gap-4 sm:grid-cols-2">
              <OrgFilterCombobox
                label="Business unit"
                value={buId ?? ''}
                onValueChange={(v) => setBuId(v || null)}
                options={buOptions}
                placeholder="All business units"
              />
              {entityLevel === 'department' && (
                <OrgFilterCombobox
                  label="Department"
                  value={deptId ?? ''}
                  onValueChange={(v) => setDeptId(v || null)}
                  options={deptOptions}
                  placeholder="All departments"
                />
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Start</Label>
              <Input type="number" value={startValue} onChange={(e) => setStartValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Target</Label>
              <Input type="number" value={targetValue} onChange={(e) => setTargetValue(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Unit</Label>
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="MT, %, ₹…" />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Progress type</Label>
              <Select value={progressType} onValueChange={(v) => setProgressType(v as GoalProgressType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="number">Number</SelectItem>
                  <SelectItem value="currency">Currency</SelectItem>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="rollup">Roll-up only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tracking</Label>
              <Select value={tracking} onValueChange={(v) => setTracking(v as GoalTrackingMethod)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_TRACKING_LABELS) as GoalTrackingMethod[]).map(k => (
                    <SelectItem key={k} value={k}>{GOAL_TRACKING_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {tracking === 'manual' && (
            <div className="space-y-2">
              <Label>Current value</Label>
              <Input type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Sub-period summary</Label>
              <Select value={rule} onValueChange={(v) => setRule(v as GoalSummaryRule)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_SUMMARY_RULE_LABELS) as GoalSummaryRule[]).map(k => (
                    <SelectItem key={k} value={k}>{GOAL_SUMMARY_RULE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Visibility</Label>
              <Select value={visibility} onValueChange={(v) => setVisibility(v as GoalVisibility)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="public">Public</SelectItem>
                  <SelectItem value="restricted">Restricted</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!canSave}>
            {upsert.isPending ? 'Saving…' : 'Save goal'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
