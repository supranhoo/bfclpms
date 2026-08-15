/**
 * ADR-267 — Goal editor for the BU Performance Console.
 *
 * A goal is a named target that lives inside a KRA category. It may roll up
 * from the live employee KPI rows it matches (category + KRA + KPI name),
 * roll up from its own sub-goals, or be typed in manually. Admin-only; writes
 * go through `bu_goal_upsert`.
 */
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { OrgFilterCombobox } from '@/components/admin/OrgFilterCombobox';
import { useKraCategories } from '@/hooks/useOrganization';
import {
  useGoalUpsert,
  useGoalKraOptions,
  GOAL_SUMMARY_RULE_LABELS,
  GOAL_SOURCE_LABELS,
  type BuGoalRow,
  type GoalEntityLevel,
  type GoalProgressType,
  type GoalSource,
  type GoalSummaryRule,
  type GoalVisibility,
} from '@/hooks/useBuConsole';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Goal being edited, or null when creating. */
  goal: BuGoalRow | null;
  /** Set when creating a sub-goal under this parent. */
  parent: BuGoalRow | null;
  year: number;
  period: string | null;
  buOptions: { value: string; label: string }[];
  deptOptions: { value: string; label: string }[];
}

const num = (v: string): number | null => (v.trim() === '' ? null : Number(v));

export function GoalFormDialog({ open, onOpenChange, goal, parent, year, period, buOptions, deptOptions }: Props) {
  const upsert = useGoalUpsert();
  const { data: categories } = useKraCategories();

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [kraName, setKraName] = useState<string | null>(null);
  const [kpiName, setKpiName] = useState<string | null>(null);
  const [kraSearch, setKraSearch] = useState('');
  const [goalSource, setGoalSource] = useState<GoalSource>('kpi_rollup');
  const [weight, setWeight] = useState('1');
  const [entityLevel, setEntityLevel] = useState<GoalEntityLevel>('bu');
  const [buId, setBuId] = useState<string | null>(null);
  const [deptId, setDeptId] = useState<string | null>(null);
  const [scopePeriod, setScopePeriod] = useState<string>('');
  const [progressType, setProgressType] = useState<GoalProgressType>('number');
  const [rule, setRule] = useState<GoalSummaryRule>('last');
  const [visibility, setVisibility] = useState<GoalVisibility>('public');
  const [unit, setUnit] = useState('');
  const [startValue, setStartValue] = useState('');
  const [targetValue, setTargetValue] = useState('');
  const [currentValue, setCurrentValue] = useState('');
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (!open) return;
    setTitle(goal?.title ?? '');
    setCategoryId(goal?.category_id ?? parent?.category_id ?? null);
    setKraName(goal?.kra_name ?? parent?.kra_name ?? null);
    setKpiName(goal?.kpi_name ?? null);
    setKraSearch('');
    setGoalSource(goal?.goal_source ?? (parent ? 'kpi_rollup' : 'child_rollup'));
    setWeight((goal?.weight ?? 1).toString());
    setEntityLevel(goal?.entity_level ?? parent?.entity_level ?? 'bu');
    setBuId(goal?.business_unit_id ?? parent?.business_unit_id ?? null);
    setDeptId(goal?.department_id ?? parent?.department_id ?? null);
    setScopePeriod(goal?.review_period ?? parent?.review_period ?? period ?? '');
    setProgressType(goal?.progress_type ?? 'number');
    setRule(goal?.subperiod_summary_rule ?? 'last');
    setVisibility(goal?.visibility ?? 'public');
    setUnit(goal?.unit ?? parent?.unit ?? '');
    setStartValue(goal?.start_value?.toString() ?? '');
    setTargetValue(goal?.target_value?.toString() ?? '');
    setCurrentValue(goal?.current_value?.toString() ?? '');
    setNotes(goal?.notes ?? '');
  }, [open, goal, parent, period]);

  const categoryOptions = useMemo(
    () => (categories ?? []).map((c: any) => ({ value: c.id, label: c.name })),
    [categories],
  );

  const { data: kraOptionsData } = useGoalKraOptions(year, categoryId, kraName, kraSearch, open && goalSource === 'kpi_rollup');

  const kraOptions = useMemo(
    () => (kraOptionsData?.kras ?? []).map(k => ({ value: k, label: k })),
    [kraOptionsData],
  );
  const kpiOptions = useMemo(
    () => (kraOptionsData?.kpis ?? []).map(k => ({ value: k, label: k })),
    [kraOptionsData],
  );
  /** ADR-264 — never hide matches silently; say when the list was cut. */
  const kraTruncated = (kraOptionsData?.kra_total ?? 0) > (kraOptionsData?.kras.length ?? 0);

  const canSave = title.trim() !== '' && !upsert.isPending;

  const save = () => {
    upsert.mutate(
      {
        id: goal?.id ?? null,
        title: title.trim(),
        categoryId,
        kraName,
        kpiNameMatch: goalSource === 'kpi_rollup' ? kpiName : null,
        goalSource,
        weight: num(weight) ?? 1,
        parentGoalId: goal?.parent_goal_id ?? parent?.id ?? null,
        reviewYear: year,
        reviewPeriod: scopePeriod.trim() === '' ? null : scopePeriod.trim(),
        entityLevel,
        businessUnitId: entityLevel === 'org' ? null : buId,
        departmentId: entityLevel === 'department' ? deptId : null,
        progressType,
        subperiodSummaryRule: rule,
        visibility,
        unit: unit.trim() === '' ? null : unit.trim(),
        startValue: num(startValue),
        targetValue: num(targetValue),
        currentValue: goalSource === 'manual' ? num(currentValue) : null,
        notes: notes.trim() === '' ? null : notes.trim(),
      },
      { onSuccess: (res) => { if (res.authorized && !res.error) onOpenChange(false); } },
    );
  };

  const heading = goal ? 'Edit goal' : parent ? `New sub-goal under “${parent.title ?? 'goal'}”` : 'New goal';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{heading}</DialogTitle>
          <DialogDescription>
            A goal states a target inside a KRA category. Employee scoring is unchanged — goals never
            overwrite review data.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Goal name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Achieve organisation production target"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <OrgFilterCombobox
              label="Category"
              value={categoryId ?? ''}
              onValueChange={(v) => { setCategoryId(v || null); setKraName(null); setKpiName(null); }}
              options={categoryOptions}
              placeholder="Pick a KRA category"
            />
            <div className="space-y-2">
              <Label>Value comes from</Label>
              <Select value={goalSource} onValueChange={(v) => setGoalSource(v as GoalSource)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(Object.keys(GOAL_SOURCE_LABELS) as GoalSource[]).map(k => (
                    <SelectItem key={k} value={k}>{GOAL_SOURCE_LABELS[k]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {goalSource === 'kpi_rollup' && (
            <div className="space-y-2 rounded-md border p-3">
              <Label className="text-xs uppercase text-muted-foreground">Link to live review data</Label>
              <Input
                placeholder="Search KRAs…"
                value={kraSearch}
                onChange={(e) => setKraSearch(e.target.value)}
              />
              <div className="grid gap-4 sm:grid-cols-2">
                <OrgFilterCombobox
                  label="KRA"
                  value={kraName ?? ''}
                  onValueChange={(v) => { setKraName(v || null); setKpiName(null); }}
                  options={kraOptions}
                  placeholder="All KRAs in the category"
                />
                <OrgFilterCombobox
                  label="KPI (optional)"
                  value={kpiName ?? ''}
                  onValueChange={(v) => setKpiName(v || null)}
                  options={kpiOptions}
                  placeholder={kraName ? 'All KPIs in the KRA' : 'Pick a KRA first'}
                />
              </div>
              {kraTruncated && (
                <p className="text-xs text-muted-foreground">
                  Showing {kraOptionsData?.kras.length} of {kraOptionsData?.kra_total} KRAs — keep typing to narrow the list.
                </p>
              )}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
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
            <div className="space-y-2">
              <Label>Weight in parent</Label>
              <Input type="number" value={weight} onChange={(e) => setWeight(e.target.value)} />
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
              <Input value={unit} onChange={(e) => setUnit(e.target.value)} placeholder="MT, MW, %, ₹…" />
            </div>
          </div>

          {goalSource === 'manual' && (
            <div className="space-y-2">
              <Label>Current value</Label>
              <Input type="number" value={currentValue} onChange={(e) => setCurrentValue(e.target.value)} />
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
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
              <Label>{goalSource === 'child_rollup' ? 'Combine sub-goals by' : 'Sub-period summary'}</Label>
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
