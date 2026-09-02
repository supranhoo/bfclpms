/**
 * ADR-274 — Edit a KPI definition once for every mapped employee.
 *
 * The admin edits the structured text, scoring model, weightage and target in
 * the same shared controls used by "Assign New KRA" and the "Admin KPI Editor"
 * (POLICY §KPI-DEFINITION-FORM-PARITY), then previews exactly which employee
 * rows change and which are skipped and why. Nothing is written until the
 * preview is confirmed. `kpi_name` is never rewritten — it stays the join key
 * for history, reports and Org KPI matching (ADR-269).
 */
import { useEffect, useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { KpiTextSplitFields } from '@/components/admin/kpi-form/KpiTextSplitFields';
import { KpiScoringEditor } from '@/components/admin/kpi-form/KpiScoringEditor';
import { UomTypeSelector } from '@/components/admin/UomTypeSelector';
import { UOM_OPTIONS } from '@/lib/uomConstants';
import {
  textStateFromRow, type KpiTextState, type KpiScoringState, type ThresholdMode,
  validateScoringState, binaryOptionsFor,
} from '@/components/admin/kpi-form/kpiFormModel';
import type { UomType } from '@/lib/qualitativeUom';
import { useKraCategories } from '@/hooks/useOrganization';
import {
  useGroupEditPreview, useGroupEditCommit,
  GROUP_EDIT_FIELDS, GROUP_EDIT_FIELD_LABELS, GROUP_EDIT_SKIP_LABELS,
  type GroupEditResult, type KpiDetailArgs,
} from '@/hooks/useBuConsole';
import {
  useGroupEditSpanPreview, useGroupEditSpanCommit, type GroupEditSpanResult,
} from '@/hooks/useBuConsole';
import {
  resolveEditSpan, spanModesAvailable, spanSkipsPastMonths, describeSpan, aggregateSpan, periodLabel, toTarget,
  backDatedTargets, isPastPeriod,
  EDIT_SPAN_LABELS, MAX_ROLLOUT_PERIODS, type EditSpanMode,
} from './groupEditSpan';

import { isDescriptiveOnly, scoringFields } from './editFieldClass';
import {
  diffChanges, hasChanges, weightageDeviations, uniqueByEmployee,
  isMultiMonthFrequency, validateCycleChange, isScopeInert, ladderForType, type ChangeSet,
} from './groupEditModel';

import { getCycleOptionsForFrequency, deriveCycleOptionFromCycleStart } from '@/lib/frequencyCycleOptions';
import { buildCycleScopeLabel } from '@/lib/frequencyUtils';
import {
  needsTypedConfirmation, confirmationSatisfied, GROUP_ACTION_CONFIRM_WORD,
} from '@/lib/review/groupPreviewSummary';
import {
  kpiScopeLabel, rowScopeNeedsTarget,
  KPI_ROW_SCOPE_TARGET_COLUMNS, KPI_ROW_TARGET_COLUMNS,
} from '@/lib/review/kpiScope';
import { useKpiRangeCorrection, type RangeDryRunRow } from '@/hooks/useKpiRangeCorrection';
import {
  buildRenameArgs, initialRenameState, isRenameNoop, renameMonthOptions, validateRename,
  type LegacyRenameState,
} from './legacyRename';
import { Checkbox } from '@/components/ui/checkbox';
import { useQueryClient } from '@tanstack/react-query';
import { ScopeTargetPicker } from '@/components/admin/kpi-scope/ScopeTargetPicker';
import { GroupDataOwnersField } from './GroupDataOwnersField';

/** ADR-322 — scopes a KPI row can be moved to today (planned ones stay out). */
const SELECTABLE_SCOPES = [
  'organization', 'department', 'employee', 'business_unit', 'location',
] as const;

interface Props {
  args: KpiDetailArgs | null;
  definition: Record<string, any>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Text fields are edited from the shared split control, so `kpi_name` is excluded. */
const TEXT_FIELDS = ['kpi_title', 'kpi_description', 'kpi_formula', 'kpi_scoring_logic'] as const;

/** Same option sets as the Admin KPI Editor (POLICY §KPI-DEFINITION-FORM-PARITY). */
const FREQUENCY_OPTIONS = ['Daily', 'Weekly', 'Monthly', 'Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

/**
 * Moving a group to another category / KRA is structural — always confirm.
 * ADR-328 — so is switching the KPI type or its qualitative options: that
 * rewrites how every mapped employee is scored.
 */
const STRUCTURAL_FIELDS = ['category_id', 'kra_name', 'uom_type', 'qualitative_options'];

/** ADR-275 — a cycle move re-anchors which months the KPI covers: always confirm. */
const CYCLE_FIELDS = ['frequency', 'frequency_cycle_start'];

const DAY_COUNT_OPTIONS = [
  { value: 'working_days', label: 'Working days only' },
  { value: 'all_days', label: 'All calendar days' },
];

export function GroupDefinitionEditDialog({ args, definition, open, onOpenChange }: Props) {
  const [text, setText] = useState<KpiTextState>(() => textStateFromRow(definition as any));
  const [scoring, setScoring] = useState<KpiScoringState>(() => scoringFromDefinition(definition));
  const [weightage, setWeightage] = useState('');
  const [target, setTarget] = useState('');
  const [uom, setUom] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [kraName, setKraName] = useState('');
  const [frequency, setFrequency] = useState('');
  const [cycleStart, setCycleStart] = useState('');
  const [dayCountType, setDayCountType] = useState('');
  const [orgLevel, setOrgLevel] = useState<boolean | null>(null);
  const [orgLevelScope, setOrgLevelScope] = useState('');
  const [scopeTargetId, setScopeTargetId] = useState('');
  const [requireResubmitReason, setRequireResubmitReason] = useState<boolean | null>(null);
  const [frequencyLocked, setFrequencyLocked] = useState<boolean | null>(null);
  const [criteria, setCriteria] = useState('');
  const [sourceOfData, setSourceOfData] = useState('');
  const [allowLocked, setAllowLocked] = useState(false);
  const [resetOverrides, setResetOverrides] = useState(false);
  const [spanMode, setSpanMode] = useState<EditSpanMode>('this');
  const [spanCount, setSpanCount] = useState(3);
  const [spanPreview, setSpanPreview] = useState<GroupEditSpanResult | null>(null);
  const [confirmText, setConfirmText] = useState('');
  // ADR-334 — opt-in legacy display-name rename (reports / Org KPI Data Entry).
  const [rename, setRename] = useState<LegacyRenameState>(() =>
    initialRenameState(
      {
        categoryId: args?.categoryId ?? '',
        oldKra: args?.kraName ?? '',
        oldKpi: args?.kpiName ?? '',
        period: args?.period ?? 'July',
        year: args?.year ?? new Date().getFullYear(),
      },
      definition?.kpi_title,
    ));
  const [renamePreview, setRenamePreview] = useState<RangeDryRunRow[] | null>(null);


  const previewMut = useGroupEditSpanPreview();
  const commitMut = useGroupEditSpanCommit();
  const { data: categories } = useKraCategories();
  const queryClient = useQueryClient();
  const { dryRun: renameDryRun, apply: renameApply, previewing: renamePreviewing, applying: renameApplying } =
    useKpiRangeCorrection();

  const renameAnchor = useMemo(() => ({
    categoryId: args?.categoryId ?? '',
    oldKra: args?.kraName ?? '',
    oldKpi: args?.kpiName ?? '',
    period: args?.period ?? 'July',
    year: args?.year ?? new Date().getFullYear(),
  }), [args?.categoryId, args?.kraName, args?.kpiName, args?.period, args?.year]);

  const renameError = validateRename(rename);
  const renameNoop = rename.enabled && !renameError && isRenameNoop(rename, renameAnchor);
  const renameArgs = buildRenameArgs(
    rename,
    renameAnchor,
    (definition?.kpi_definition_id as string) ?? null,
  );
  const renameRows = (renamePreview ?? []).reduce((n, r) => n + Number(r.kpi_rows ?? 0), 0);
  const renameOrgRows = (renamePreview ?? []).reduce((n, r) => n + Number(r.org_rows ?? 0), 0);
  const renameLocked = (renamePreview ?? []).reduce((n, r) => n + Number(r.locked_rows ?? 0), 0);

  const monthOptions = useMemo(() => {
    const base = renameAnchor.year;
    return renameMonthOptions([base - 1, base, base + 1]);
  }, [renameAnchor.year]);

  const patchRename = (patch: Partial<LegacyRenameState>) => {
    setRename((prev) => ({ ...prev, ...patch }));
    setRenamePreview(null);
  };

  const runRenamePreview = async () => {
    if (!renameArgs) return;
    setRenamePreview(await renameDryRun(renameArgs));
  };

  const setPreview = (v: GroupEditSpanResult | null) => setSpanPreview(v);


  const spanModes = useMemo(
    () => (args ? spanModesAvailable(toTarget(args.period, args.year)) : (['this'] as EditSpanMode[])),
    [args?.period, args?.year],
  );

  const targets = useMemo(
    () => (args ? resolveEditSpan(toTarget(args.period, args.year), spanMode, spanCount) : []),
    [args?.period, args?.year, spanMode, spanCount],
  );

  const pastAnchorSpan = useMemo(
    () => (args ? spanSkipsPastMonths(toTarget(args.period, args.year), spanMode, new Date(), spanCount) : false),
    [args?.period, args?.year, spanMode, spanCount],
  );

  /** ADR-337 — the back-dated months of the span, named explicitly. */
  const backDatedLabel = useMemo(() => {
    const back = backDatedTargets(targets);
    if (!back.length) return '';
    return `${back.map(periodLabel).join(', ')} ${back.length === 1 ? 'is' : 'are'}`;
  }, [targets]);



  /** Detail lists (weightage, skips, clashes) always describe the selected month. */
  const preview: GroupEditResult | null = spanPreview?.entries[0]?.result ?? null;
  const spanTotals = useMemo(
    () => aggregateSpan(spanPreview?.entries ?? []),
    [spanPreview],
  );

  // Re-seed the form each time the dialog opens on a (possibly different) KPI.
  useEffect(() => {
    if (!open) return;
    setText(textStateFromRow(definition as any));
    setScoring(scoringFromDefinition(definition));
    setWeightage('');
    setTarget(definition?.target_value != null ? String(definition.target_value) : '');
    setUom(definition?.uom ?? '');
    setCategoryId(definition?.category_id ?? args?.categoryId ?? '');
    setKraName(definition?.kra_name ?? args?.kraName ?? '');
    setFrequency(definition?.frequency ?? '');
    setCycleStart(definition?.frequency_cycle_start ?? '');
    setDayCountType(definition?.day_count_type ?? '');
    setOrgLevel(definition?.is_org_level ?? false);
    setOrgLevelScope(definition?.org_level_scope ?? '');
    setScopeTargetId(
      (definition?.[KPI_ROW_SCOPE_TARGET_COLUMNS[
        (definition?.org_level_scope ?? 'organization') as keyof typeof KPI_ROW_SCOPE_TARGET_COLUMNS
      ] ?? ''] as string) ?? '',
    );
    setRequireResubmitReason(definition?.require_resubmit_reason ?? false);
    setFrequencyLocked(definition?.is_frequency_locked ?? false);
    setCriteria(definition?.criteria ?? '');
    setSourceOfData(definition?.source_of_data ?? '');
    setPreview(null);
    setConfirmText('');
    setAllowLocked(false);
    setResetOverrides(false);
    setSpanMode('this');
    setSpanCount(3);
    // ADR-334 — the rename is always opt-in again on every open.
    setRename(initialRenameState(
      {
        categoryId: args?.categoryId ?? '',
        oldKra: definition?.kra_name ?? args?.kraName ?? '',
        oldKpi: args?.kpiName ?? '',
        period: args?.period ?? 'July',
        year: args?.year ?? new Date().getFullYear(),
      },
      definition?.kpi_title,
    ));
    setRenamePreview(null);
  }, [open, definition, args?.categoryId, args?.kraName, args?.kpiName, args?.period, args?.year]);


  const original = useMemo(() => ({
    kpi_title: definition?.kpi_title ?? null,
    kpi_description: definition?.kpi_description ?? null,
    kpi_formula: definition?.kpi_formula ?? null,
    kpi_scoring_logic: definition?.kpi_scoring_logic ?? null,
    uom_type: definition?.uom_type ?? 'numeric',
    threshold_mode: definition?.threshold_mode ?? null,
    qualitative_options: definition?.qualitative_options ?? null,
    r5: definition?.r5 ?? null, r4: definition?.r4 ?? null, r3: definition?.r3 ?? null,
    r2: definition?.r2 ?? null, r1: definition?.r1 ?? null, r0: definition?.r0 ?? null,
    uom: definition?.uom ?? null,
    target_value: definition?.target_value ?? null,
    weightage: null,
    category_id: definition?.category_id ?? args?.categoryId ?? null,
    kra_name: definition?.kra_name ?? args?.kraName ?? null,
    frequency: definition?.frequency ?? null,
    frequency_cycle_start: definition?.frequency_cycle_start ?? null,
    day_count_type: definition?.day_count_type ?? null,
    is_org_level: definition?.is_org_level ?? false,
    org_level_scope: definition?.org_level_scope ?? null,
    require_resubmit_reason: definition?.require_resubmit_reason ?? false,
    is_frequency_locked: definition?.is_frequency_locked ?? false,
    criteria: definition?.criteria ?? null,
    source_of_data: definition?.source_of_data ?? null,
    // ADR-322 — the grouped scope's target id.
    ...Object.fromEntries(KPI_ROW_TARGET_COLUMNS.map((c) => [c, definition?.[c] ?? null])),
  }), [definition, args?.categoryId, args?.kraName]);

  /** ADR-328 — only a value-based KPI owns a unit and the R0–R5 ladder. */
  const numericType = scoring.uom_type === 'numeric';

  /** Standard units, plus any legacy value already stored so it is never lost. */
  const uomOptions = useMemo(() => {
    const base = UOM_OPTIONS.map((o) => ({ value: o.value as string, label: o.label as string }));
    const current = (definition?.uom ?? '').trim();
    return current && !base.some((o) => o.value === current)
      ? [{ value: current, label: `${current} (current)` }, ...base]
      : base;
  }, [definition?.uom]);

  const changes: ChangeSet = useMemo(() => {
    // ADR-326 — scope is inert for a KPI that is not organisation-level and was
    // not organisation-level before. Emitting a "clear the scope" change there is
    // a phantom edit that would drop the whole run onto the protected path.
    const scopeInert = isScopeInert(orgLevel, original.is_org_level as boolean | null | undefined);
    const next: Record<string, unknown> = {
      kpi_title: text.kpi_title,
      kpi_description: text.kpi_description,
      kpi_formula: text.kpi_formula,
      kpi_scoring_logic: text.kpi_scoring_logic,
      uom_type: scoring.uom_type,
      threshold_mode: scoring.uom_type === 'numeric' ? scoring.threshold_mode : null,
      qualitative_options:
        scoring.uom_type === 'tiered' || scoring.uom_type === 'binary' ? scoring.qualitative_options : null,
      // ADR-328 — a Yes/No or tiered KPI is scored from its options: the numeric
      // ladder and the unit are inert there and must not travel in the run.
      ...ladderForType(scoring.uom_type, {
        r5: scoring.r5, r4: scoring.r4, r3: scoring.r3,
        r2: scoring.r2, r1: scoring.r1, r0: scoring.r0, uom,
      }),
      target_value: target,
      weightage,
      category_id: categoryId,
      kra_name: kraName,
      frequency,
      // A single-month frequency must not keep a multi-month anchor.
      frequency_cycle_start: isMultiMonthFrequency(frequency) ? cycleStart : '',
      day_count_type: frequency === 'Daily' ? dayCountType : original.day_count_type ?? '',
      is_org_level: orgLevel === null ? '' : String(orgLevel),
      require_resubmit_reason: requireResubmitReason === null ? '' : String(requireResubmitReason),
      is_frequency_locked: frequencyLocked === null ? '' : String(frequencyLocked),
      criteria,
      source_of_data: sourceOfData,
    };

    if (!scopeInert) {
      next.org_level_scope = orgLevel ? orgLevelScope : '';
      // ADR-322 — exactly one target travels with the scope; the others clear.
      Object.assign(
        next,
        Object.fromEntries(KPI_ROW_TARGET_COLUMNS.map((c) => [
          c,
          orgLevel && KPI_ROW_SCOPE_TARGET_COLUMNS[
            orgLevelScope as keyof typeof KPI_ROW_SCOPE_TARGET_COLUMNS
          ] === c
            ? scopeTargetId
            : '',
        ])),
      );
    }

    return diffChanges(original, next, GROUP_EDIT_FIELDS as unknown as string[]);
  }, [
    text, scoring, numericType, uom, target, weightage, categoryId, kraName, frequency, cycleStart,
    dayCountType, orgLevel, orgLevelScope, scopeTargetId, requireResubmitReason, frequencyLocked,
    criteria, sourceOfData, original,
  ]);


  const changedFields = Object.keys(changes);
  const descriptiveOnly = isDescriptiveOnly(changes);
  const affected = spanPreview ? spanTotals.willWrite : 0;
  const structural = changedFields.some((f) => STRUCTURAL_FIELDS.includes(f));
  const cycleMove = changedFields.some((f) => CYCLE_FIELDS.includes(f));
  const bigScope = needsTypedConfirmation(preview) || ((structural || cycleMove) && affected > 0);
  const confirmed = bigScope
    ? confirmText.trim().toUpperCase() === GROUP_ACTION_CONFIRM_WORD
    : confirmationSatisfied(preview, confirmText);
  const weightRows = uniqueByEmployee(preview?.weightage_impact);
  const deviations = weightageDeviations(weightRows);
  // ADR-322 — a grouped scope cannot be saved without naming its target.
  const scopeError = orgLevel && rowScopeNeedsTarget(orgLevelScope) && !scopeTargetId
    ? `Choose which ${kpiScopeLabel(orgLevelScope).toLowerCase()} this KPI applies to.`
    : null;
  // ADR-328 — a type must be internally valid before anything is previewed:
  // tiered needs options, binary needs a polarity, numeric needs its ladder.
  const scoringError = validateScoringState(scoring)
    || (numericType && !uom && !!original.uom
      ? 'Pick a unit of measure for this value-based KPI.'
      : null);
  const cycleError = validateCycleChange(changes) || scopeError || scoringError;
  const conflicts = preview?.anchor_conflicts ?? [];
  // ADR-326 — which fields keep this run on the protected path, and how many rows
  // get the wording slice only.
  const blockingFields = scoringFields(changes);
  const partialRows = spanPreview
    ? spanPreview.entries.reduce((n, e) => n + (e.result?.partial_rows ?? 0), 0)
    : 0;
  const skipReasonLabel = (res?: { skip_summary?: { reason: string; count: number }[] } | null) => {
    const rows = res?.skip_summary ?? [];
    if (rows.length === 0) return null;
    return rows
      .map((r) => `${GROUP_EDIT_SKIP_LABELS[r.reason] ?? r.reason} (${r.count})`)
      .join(' · ');
  };


  const cycleOptions = useMemo(() => {
    const opts = getCycleOptionsForFrequency(frequency) ?? [];
    // Keep an existing non-standard anchor selectable so it is never lost.
    if (cycleStart && !opts.some((o) => o.value === cycleStart)) {
      const derived = deriveCycleOptionFromCycleStart(frequency, cycleStart);
      if (derived) return [derived, ...opts];
    }
    return opts;
  }, [frequency, cycleStart]);

  const cycleScope = useMemo(() => {
    if (!args || !isMultiMonthFrequency(frequency) || !cycleStart) return null;
    try {
      return buildCycleScopeLabel(frequency, args.period, args.year, cycleStart);
    } catch {
      return null;
    }
  }, [args, frequency, cycleStart]);

  const runPreview = () => {
    if (!args || !hasChanges(changes) || cycleError) return;
    previewMut.mutate(
      { ...baseArgs(args, (definition?.kpi_definition_id as string) ?? null), targets, changes, allowLocked, resetOverrides, textOnly: descriptiveOnly },
      { onSuccess: (res) => { setPreview(res); setConfirmText(''); } },
    );
  };

  const runCommit = () => {
    if (!args || !spanPreview) return;
    commitMut.mutate(
      { ...baseArgs(args, (definition?.kpi_definition_id as string) ?? null), targets, changes, allowLocked, resetOverrides, textOnly: descriptiveOnly },
      {
        onSuccess: async () => {
          // ADR-334 — the rename runs only after the definition edit succeeded.
          // If it fails, the definition changes stay and the hook toasts the
          // rename as the failed part; the dialog stays open so it can be retried.
          if (renameArgs) {
            const res = await renameApply(renameArgs);
            if (!res) return;
            await queryClient.invalidateQueries();
          }
          onOpenChange(false);
        },
      },
    );
  };


  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit definition for the whole group</DialogTitle>
          <DialogDescription>
            Only the fields you change are written.{' '}
            {rename.enabled
              ? 'The legacy KPI name will also be renamed for the months you pick below, so reports and Org KPI Data Entry match.'
              : 'The legacy KPI name is kept as-is so history, reports and Org KPI matching keep working — tick the rename option below to update it too.'}
          </DialogDescription>

        </DialogHeader>

        <div className="space-y-4">
          <KpiTextSplitFields value={text} onChange={setText} hideName />

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Category</Label>
              <Select value={categoryId || undefined} onValueChange={(v) => { setCategoryId(v); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                <SelectContent>
                  {(categories ?? []).map((c: any) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">KRA</Label>
              <Input value={kraName} onChange={(e) => { setKraName(e.target.value); setPreview(null); }} />
            </div>
          </div>

          {/* ADR-328 — the KPI type is shared by the whole group and decides how
              it is scored: value based, Yes/No or tiered options. */}
          <UomTypeSelector
            value={scoring.uom_type}
            onChange={(t) => {
              setScoring((prev) => ({
                ...prev,
                uom_type: t,
                threshold_mode: t === 'numeric' ? prev.threshold_mode : 'absolute',
                qualitative_options:
                  t === 'binary'
                    ? binaryOptionsFor(false)
                    : t === 'tiered'
                      ? (prev.qualitative_options?.length ? prev.qualitative_options : [])
                      : [],
              }));
              setPreview(null);
            }}
          />

          <div className={`grid gap-3 ${numericType ? 'sm:grid-cols-3' : 'sm:grid-cols-1'}`}>
            <div className="space-y-1.5">
              <Label className="text-xs">Weightage (leave blank to keep each employee's own)</Label>
              <Input
                value={weightage}
                onChange={(e) => { setWeightage(e.target.value); setPreview(null); }}
                inputMode="decimal"
                placeholder="unchanged"
              />
            </div>
            {/* ADR-341 — only a value-based KPI owns a target. */}
            {numericType && (
              <div className="space-y-1.5">
                <Label className="text-xs">Target</Label>
                <Input value={target} onChange={(e) => { setTarget(e.target.value); setPreview(null); }} inputMode="decimal" />
              </div>
            )}

            {numericType && (
              <div className="space-y-1.5">
                <Label className="text-xs">Unit</Label>
                <Select value={uom || undefined} onValueChange={(v) => { setUom(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="Select unit" /></SelectTrigger>
                  <SelectContent>
                    {uomOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>


          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">Frequency</Label>
              <Select
                value={frequency || undefined}
                onValueChange={(v) => {
                  setFrequency(v);
                  // Seed a sensible anchor so a multi-month move is never sent blind.
                  setCycleStart(
                    isMultiMonthFrequency(v)
                      ? (definition?.frequency === v ? definition?.frequency_cycle_start ?? '' : getCycleOptionsForFrequency(v)?.[0]?.value ?? '')
                      : '',
                  );
                  setPreview(null);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Unchanged" /></SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Source of data</Label>
              <Input value={sourceOfData} onChange={(e) => { setSourceOfData(e.target.value); setPreview(null); }} />
            </div>
          </div>

          {isMultiMonthFrequency(frequency) && (
            <div className="space-y-2 rounded-md border p-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Cycle anchor (which months this KPI covers)</Label>
                <Select value={cycleStart || undefined} onValueChange={(v) => { setCycleStart(v); setPreview(null); }}>
                  <SelectTrigger><SelectValue placeholder="Pick the cycle" /></SelectTrigger>
                  <SelectContent>
                    {cycleOptions.map((o) => (
                      <SelectItem key={o.value} value={o.value}>{o.value} — {o.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {cycleScope?.isMultiMonth && (
                <p className="text-[11px] text-muted-foreground">
                  Covers {cycleScope.cycleMonths.join(', ')} — reviewed once in{' '}
                  {cycleScope.anchorMonth} {cycleScope.anchorYear}. The approved score is
                  back-filled to the other months in the cycle (POLICY §54 v3).
                </p>
              )}
              {cycleError && (
                <p className="flex items-center gap-1 text-xs text-destructive">
                  <AlertTriangle className="h-3 w-3" /> {cycleError}
                </p>
              )}
            </div>
          )}

          {frequency === 'Daily' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Day counting</Label>
              <Select value={dayCountType || undefined} onValueChange={(v) => { setDayCountType(v); setPreview(null); }}>
                <SelectTrigger><SelectValue placeholder="Unchanged" /></SelectTrigger>
                <SelectContent>
                  {DAY_COUNT_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">
                Drives the expected day count and the missed-days penalty for Daily KPIs.
              </p>
            </div>
          )}

          <KpiScoringEditor
            value={scoring}
            onChange={(s) => { setScoring(s); setPreview(null); }}
            criteria={criteria}
            onCriteriaChange={(v) => { setCriteria(v); setPreview(null); }}
          />

          {structural && (
            <Alert>
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>
                Moving the group to another category or KRA changes where these KPIs are grouped in
                reviews and reports. Confirm before applying.
              </AlertDescription>
            </Alert>
          )}

          <div className="space-y-2 rounded-md border p-3">
            <p className="text-xs font-semibold uppercase text-muted-foreground">Advanced</p>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs font-medium">Organisation-level KPI</Label>
                <p className="text-[11px] text-muted-foreground">
                  Value is entered once centrally and shared with every mapped employee.
                </p>
              </div>
              <Switch checked={!!orgLevel} onCheckedChange={(v) => { setOrgLevel(v); setPreview(null); }} />
            </div>
            {orgLevel && (
              <>
                <div className="space-y-1.5 min-w-0">
                  <Label className="text-xs">Scope</Label>
                  <Select
                    value={orgLevelScope || 'organization'}
                    onValueChange={(v) => {
                      setOrgLevelScope(v);
                      setScopeTargetId('');
                      setPreview(null);
                    }}
                  >
                    <SelectTrigger className="h-10">
                      <SelectValue placeholder="Select a scope" />
                    </SelectTrigger>
                    <SelectContent>
                      {SELECTABLE_SCOPES.map((s) => (
                        <SelectItem key={s} value={s}>{kpiScopeLabel(s)}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-[11px] text-muted-foreground">
                    Who one central value reaches. Scoring and approvals are unchanged.
                  </p>
                </div>
                {rowScopeNeedsTarget(orgLevelScope) && (
                  <ScopeTargetPicker
                    id="group-scope-target"
                    scope={orgLevelScope}
                    value={scopeTargetId || null}
                    onChange={(v) => { setScopeTargetId(v ?? ''); setPreview(null); }}
                  />
                )}
                {scopeError && (
                  <p className="flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle className="h-3 w-3" /> {scopeError}
                  </p>
                )}
                <GroupDataOwnersField
                  categoryId={categoryId}
                  kraName={kraName}
                  kpiName={definition?.kpi_name ?? ''}
                />
              </>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs font-medium">Require a reason on resubmission</Label>
                <p className="text-[11px] text-muted-foreground">Employees must explain a changed value.</p>
              </div>
              <Switch
                checked={!!requireResubmitReason}
                onCheckedChange={(v) => { setRequireResubmitReason(v); setPreview(null); }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs font-medium">Lock frequency after submission</Label>
                <p className="text-[11px] text-muted-foreground">
                  Stops the cycle being changed once scores exist.
                </p>
              </div>
              <Switch
                checked={!!frequencyLocked}
                onCheckedChange={(v) => { setFrequencyLocked(v); setPreview(null); }}
              />
            </div>
          </div>

          <div className="space-y-2 rounded-md border p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs font-medium">Include rows already in review</Label>
                <p className="text-[11px] text-muted-foreground">
                  Edits rows past KRA-set too. Approved final scores are never touched.
                </p>
              </div>
              <Switch checked={allowLocked} onCheckedChange={(v) => { setAllowLocked(v); setPreview(null); }} />
            </div>
            {/* ADR-323 — descriptive-only standardisation is derived automatically. */}
            {descriptiveOnly && (
              <Alert>
                <div>
                  <AlertDescription>
                    <strong>Definition text only.</strong> Matching rows at every review stage will update automatically;
                    scores, targets, weightages, ratings and workflow statuses stay unchanged.
                  </AlertDescription>
                </div>
              </Alert>
            )}
            <div className="flex items-center justify-between gap-3">
              <div>
                <Label className="text-xs font-medium">Reset individual overrides</Label>
                <p className="text-[11px] text-muted-foreground">
                  Also overwrite fields that were tuned for a single employee.
                </p>
              </div>
              <Switch checked={resetOverrides} onCheckedChange={(v) => { setResetOverrides(v); setPreview(null); }} />
            </div>
          </div>

          {/* ADR-334 — opt-in legacy display-name rename (reports + Org KPI Data Entry). */}
          <div className="space-y-3 rounded-md border p-3">
            <div className="flex items-start gap-3">
              <Checkbox
                id="legacy-rename"
                checked={rename.enabled}
                onCheckedChange={(v) => patchRename({ enabled: v === true })}
              />
              <div className="space-y-0.5">
                <Label htmlFor="legacy-rename" className="text-xs font-medium">
                  Also update the legacy display name used in reports and Org KPI Data Entry
                </Label>
                <p className="text-[11px] text-muted-foreground">
                  Off by default. The wording above always updates the scorecard and console;
                  this also rewrites the old KPI name that reports and Excel exports still show.
                </p>
              </div>
            </div>

            {rename.enabled && (
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs">New KRA name</Label>
                    <Input
                      value={rename.newKra}
                      onChange={(e) => patchRename({ newKra: e.target.value })}
                    />
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs">New KPI name</Label>
                    <Input
                      value={rename.newKpi}
                      onChange={(e) => patchRename({ newKpi: e.target.value })}
                    />
                  </div>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs">Rename from</Label>
                    <Select
                      value={`${rename.fromPeriod}|${rename.fromYear}`}
                      onValueChange={(v) => {
                        const [p, y] = v.split('|');
                        patchRename({ fromPeriod: p, fromYear: Number(y) });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {monthOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5 min-w-0">
                    <Label className="text-xs">Rename to</Label>
                    <Select
                      value={`${rename.toPeriod}|${rename.toYear}`}
                      onValueChange={(v) => {
                        const [p, y] = v.split('|');
                        patchRename({ toPeriod: p, toYear: Number(y) });
                      }}
                    >
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {monthOptions.map((o) => (
                          <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Months before May 2026 are frozen and cannot be renamed. A rename is one
                  reversible action — it can be undone from KPI Standardization — and it only
                  changes text: targets, weightages, scores and workflow status are never touched.
                </p>

                {renameError && (
                  <Alert variant="destructive">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>{renameError}</AlertDescription>
                  </Alert>
                )}
                {!renameError && renameNoop && (
                  <p className="text-[11px] text-muted-foreground">
                    The names are unchanged, so nothing will be renamed.
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={runRenamePreview}
                    disabled={!renameArgs || renamePreviewing}
                  >
                    {renamePreviewing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Preview rename
                  </Button>
                  {renamePreview && (
                    <>
                      <Badge>{renameRows} rows to rename</Badge>
                      <Badge variant="outline">{renameOrgRows} Org KPI rows</Badge>
                      <Badge variant="outline">{renameLocked} locked rows</Badge>
                    </>
                  )}
                </div>

                {renamePreview && renamePreview.length > 0 && (
                  <details className="rounded-md border p-3 text-sm" open>
                    <summary className="cursor-pointer font-medium">Per-month rename preview</summary>
                    <Table className="mt-2">
                      <TableHeader>
                        <TableRow>
                          <TableHead>Period</TableHead>
                          <TableHead className="text-right">Rows</TableHead>
                          <TableHead className="text-right">Locked</TableHead>
                          <TableHead className="text-right">Org KPI</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {renamePreview.map((r) => (
                          <TableRow key={`${r.review_period}-${r.review_year}`}>
                            <TableCell>{r.review_period} {r.review_year}</TableCell>
                            <TableCell className="text-right">{r.kpi_rows}</TableCell>
                            <TableCell className="text-right">{r.locked_rows}</TableCell>
                            <TableCell className="text-right">{r.org_rows}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </details>
                )}
                {renamePreview && renamePreview.length === 0 && (
                  <p className="text-[11px] text-muted-foreground">
                    No matching rows found in that range.
                  </p>
                )}
              </div>
            )}
          </div>


          <div className="text-xs text-muted-foreground">
            {changedFields.length === 0
              ? 'No changes yet.'
              : (
                <span className="flex flex-wrap items-center gap-1">
                  Changing:
                  {changedFields.map(f => (
                    <Badge key={f} variant="secondary">{GROUP_EDIT_FIELD_LABELS[f] ?? f}</Badge>
                  ))}
                </span>
              )}
          </div>

          {/* ADR-291 — repeat the same edit into future months of the fiscal cycle. */}
          <div className="space-y-2 rounded-md border p-3">
            <Label className="text-xs font-medium">Apply to</Label>
            <div className="flex flex-wrap items-center gap-2">
              <Select
                value={spanMode}
                onValueChange={(v) => { setSpanMode(v as EditSpanMode); setPreview(null); }}
              >
                <SelectTrigger className="w-[240px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {spanModes.map((m) => (
                    <SelectItem key={m} value={m}>{EDIT_SPAN_LABELS[m]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {spanMode === 'next_n' && (
                <Input
                  type="number"
                  min={2}
                  max={MAX_ROLLOUT_PERIODS}
                  value={spanCount}
                  onChange={(e) => {
                    const n = Math.max(2, Math.min(MAX_ROLLOUT_PERIODS, Number(e.target.value) || 2));
                    setSpanCount(n);
                    setPreview(null);
                  }}
                  className="w-20"
                />
              )}
              <Badge variant="secondary">{describeSpan(targets)}</Badge>
            </div>
            <p className="text-[11px] text-muted-foreground">
              {pastAnchorSpan
                ? `The span is contiguous from the month you picked: ${backDatedLabel} already in the past and will be back-dated, the rest are future months. Nothing before the selected month is touched (max ${MAX_ROLLOUT_PERIODS} periods).`
                : `Nothing before the selected month is touched. Each month is previewed and written separately, and each one can be undone on its own (max ${MAX_ROLLOUT_PERIODS} periods).`}
            </p>


          </div>

          {spanPreview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge>{spanTotals.willWrite} rows will change</Badge>
                <Badge variant="outline">{spanTotals.willSkip} skipped</Badge>
                {partialRows > 0 && (
                  <Badge variant="outline">{partialRows} wording only (protected rows)</Badge>
                )}
                {targets.length > 1 && (
                  <Badge variant="outline">
                    {spanTotals.monthsWithWork} of {targets.length} months affected
                  </Badge>
                )}
              </div>

              {partialRows > 0 && blockingFields.length > 0 && (
                <p className="text-[11px] text-muted-foreground">
                  {partialRows} row{partialRows === 1 ? '' : 's'} are locked (approved final score or
                  already in review). Their wording is updated, but{' '}
                  {blockingFields.map((f) => GROUP_EDIT_FIELD_LABELS[f] ?? f).join(', ')} stay unchanged
                  there, so no score can move (ADR-326).
                </p>
              )}


              {targets.length > 1 && (
                <details className="rounded-md border p-3 text-sm" open>
                  <summary className="cursor-pointer font-medium">Per-month preview</summary>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Period</TableHead>
                        <TableHead className="text-right">Rows</TableHead>
                        <TableHead className="text-right">Skipped</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {spanPreview.entries.map((e) => {
                        const noMatch = !e.error
                          && (e.result?.will_write ?? 0) === 0
                          && (e.result?.will_skip ?? 0) === 0;
                        return (
                        <TableRow
                          key={periodLabel(e.target)}
                          className={noMatch ? 'bg-amber-500/10' : undefined}
                        >
                          <TableCell>
                            {periodLabel(e.target)}
                            {isPastPeriod(e.target as any) && (
                              <Badge variant="outline" className="ml-2 text-[10px]">back-dated</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">
                            {e.error
                              ? <span className="text-destructive">{e.error}</span>
                              : (e.result?.will_write ?? 0) > 0
                                ? (
                                  <span>
                                    {e.result?.will_write} will update
                                    {(e.result?.partial_rows ?? 0) > 0 && (
                                      <span className="text-muted-foreground">
                                        {' '}({e.result?.partial_rows} wording only)
                                      </span>
                                    )}
                                  </span>
                                )
                                : (e.result?.will_skip ?? 0) > 0
                                  ? (
                                    <span className="text-muted-foreground break-words">
                                      {skipReasonLabel(e.result) ?? 'rows skipped'}
                                    </span>
                                  )
                                  : (
                                    <span className="text-amber-700 dark:text-amber-400">
                                      no rows matched in this month
                                    </span>
                                  )}
                          </TableCell>
                          <TableCell className="text-right">{e.result?.will_skip ?? 0}</TableCell>
                        </TableRow>
                        );
                      })}


                    </TableBody>
                  </Table>
                </details>
              )}

              {deviations.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {deviations.length} employee{deviations.length === 1 ? '' : 's'} will no longer total 100%
                    weightage. This is allowed, but check the list below.
                  </AlertDescription>
                </Alert>
              )}

              {conflicts.length > 0 && (
                <details className="rounded-md border border-destructive/40 p-3 text-sm" open>
                  <summary className="cursor-pointer font-medium text-destructive">
                    Cycle clashes ({conflicts.length}) — these employees are skipped
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {conflicts.slice(0, 50).map((c) => (
                      <li key={c.kpi_id}>
                        {c.employee_name ?? c.employee_id}
                        {c.employee_code ? ` (${c.employee_code})` : ''} — already on{' '}
                        {c.existing_anchor} for this KPI, cannot also run {c.new_anchor}.
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {weightRows.length > 0 && (
                <details className="rounded-md border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">Weightage impact ({weightRows.length})</summary>
                  <Table className="mt-2">
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead className="text-right">Now</TableHead>
                        <TableHead className="text-right">After</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {weightRows.slice(0, 50).map((r) => (
                        <TableRow key={r.employee_id}>
                          <TableCell>{r.employee_name ?? r.employee_id}</TableCell>
                          <TableCell className="text-right">{Number(r.current_total ?? 0).toFixed(2)}</TableCell>
                          <TableCell className={`text-right ${Math.abs(Number(r.new_total ?? 0) - 100) > 0.01 ? 'text-destructive' : ''}`}>
                            {Number(r.new_total ?? 0).toFixed(2)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </details>
              )}

              {(preview.skipped_details ?? []).length > 0 && (
                <details className="rounded-md border p-3 text-sm">
                  <summary className="cursor-pointer font-medium">
                    Skipped employees ({preview.will_skip ?? preview.skipped_details!.length})
                  </summary>
                  <ul className="mt-2 space-y-1 text-muted-foreground">
                    {preview.skipped_details!.map(r => (
                      <li key={r.kpi_id}>
                        {r.employee_name ?? r.kpi_id}
                        {r.employee_code ? ` (${r.employee_code})` : ''} —{' '}
                        {GROUP_EDIT_SKIP_LABELS[r.reason] ?? r.reason}
                      </li>
                    ))}
                  </ul>
                </details>
              )}

              {bigScope && (
                <Alert variant="destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="space-y-2">
                    <p>
                      This edits <strong>{affected}</strong> employee rows across{' '}
                      <strong>{targets.length}</strong> period{targets.length === 1 ? '' : 's'}. Type{' '}
                      <strong>{GROUP_ACTION_CONFIRM_WORD}</strong> to confirm.
                    </p>
                    <Input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      placeholder={GROUP_ACTION_CONFIRM_WORD}
                      className="max-w-[200px]"
                    />
                  </AlertDescription>
                </Alert>
              )}
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="secondary"
            onClick={runPreview}
            disabled={!hasChanges(changes) || !!cycleError || previewMut.isPending || !args}
          >
            {previewMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {preview ? 'Refresh preview' : 'Preview changes'}
          </Button>
          <Button
            onClick={runCommit}
            disabled={
              !spanPreview || affected === 0 || commitMut.isPending || !confirmed
              || !!renameError || renameApplying
            }
          >
            {(commitMut.isPending || renameApplying) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply to {affected} rows{targets.length > 1 ? ` · ${targets.length} months` : ''}
            {renameArgs
              ? ` · rename ${renamePreview ? `${renameRows} rows across ${renamePreview.length} months` : 'legacy name'}`
              : ''}
          </Button>

        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function baseArgs(a: KpiDetailArgs, definitionId?: string | null) {
  return {
    categoryId: a.categoryId,
    kraName: a.kraName,
    kpiName: a.kpiName,
    period: a.period,
    year: a.year,
    buIds: a.buIds,
    deptIds: a.deptIds,
    divisionIds: a.divisionIds,
    managerIds: a.managerIds,
    titleKey: a.titleKey ?? null,
    variantKey: a.variantKey ?? null,
    /** ADR-337 — stable fallback key when a month's rows lost their title. */
    definitionId: definitionId ?? null,
  };
}


function scoringFromDefinition(def: Record<string, any> | null | undefined): KpiScoringState {
  return {
    uom_type: (def?.uom_type ?? 'numeric') as UomType,
    threshold_mode: (def?.threshold_mode ?? 'absolute') as ThresholdMode,
    qualitative_options: Array.isArray(def?.qualitative_options) ? def!.qualitative_options : [],
    r5: def?.r5 ?? '', r4: def?.r4 ?? '', r3: def?.r3 ?? '',
    r2: def?.r2 ?? '', r1: def?.r1 ?? '', r0: def?.r0 ?? '',
  };
}
