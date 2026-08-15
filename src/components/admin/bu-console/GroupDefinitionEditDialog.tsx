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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { KpiTextSplitFields } from '@/components/admin/kpi-form/KpiTextSplitFields';
import { KpiScoringEditor } from '@/components/admin/kpi-form/KpiScoringEditor';
import {
  textStateFromRow, type KpiTextState, type KpiScoringState, type ThresholdMode,
} from '@/components/admin/kpi-form/kpiFormModel';
import type { UomType } from '@/lib/qualitativeUom';
import {
  useGroupEditPreview, useGroupEditCommit,
  GROUP_EDIT_FIELDS, GROUP_EDIT_FIELD_LABELS, GROUP_EDIT_SKIP_LABELS,
  type GroupEditResult, type KpiDetailArgs,
} from '@/hooks/useBuConsole';
import { diffChanges, hasChanges, weightageDeviations, uniqueByEmployee, type ChangeSet } from './groupEditModel';
import {
  needsTypedConfirmation, confirmationSatisfied, GROUP_ACTION_CONFIRM_WORD,
} from '@/lib/review/groupPreviewSummary';

interface Props {
  args: KpiDetailArgs | null;
  definition: Record<string, any>;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Text fields are edited from the shared split control, so `kpi_name` is excluded. */
const TEXT_FIELDS = ['kpi_title', 'kpi_description', 'kpi_formula', 'kpi_scoring_logic'] as const;

export function GroupDefinitionEditDialog({ args, definition, open, onOpenChange }: Props) {
  const [text, setText] = useState<KpiTextState>(() => textStateFromRow(definition as any));
  const [scoring, setScoring] = useState<KpiScoringState>(() => scoringFromDefinition(definition));
  const [weightage, setWeightage] = useState('');
  const [target, setTarget] = useState('');
  const [uom, setUom] = useState('');
  const [allowLocked, setAllowLocked] = useState(false);
  const [resetOverrides, setResetOverrides] = useState(false);
  const [preview, setPreview] = useState<GroupEditResult | null>(null);
  const [confirmText, setConfirmText] = useState('');

  const previewMut = useGroupEditPreview();
  const commitMut = useGroupEditCommit();

  // Re-seed the form each time the dialog opens on a (possibly different) KPI.
  useEffect(() => {
    if (!open) return;
    setText(textStateFromRow(definition as any));
    setScoring(scoringFromDefinition(definition));
    setWeightage('');
    setTarget(definition?.target_value != null ? String(definition.target_value) : '');
    setUom(definition?.uom ?? '');
    setPreview(null);
    setConfirmText('');
    setAllowLocked(false);
    setResetOverrides(false);
  }, [open, definition]);

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
  }), [definition]);

  const changes: ChangeSet = useMemo(() => {
    const next: Record<string, unknown> = {
      kpi_title: text.kpi_title,
      kpi_description: text.kpi_description,
      kpi_formula: text.kpi_formula,
      kpi_scoring_logic: text.kpi_scoring_logic,
      uom_type: scoring.uom_type,
      threshold_mode: scoring.uom_type === 'numeric' ? scoring.threshold_mode : null,
      qualitative_options:
        scoring.uom_type === 'tiered' || scoring.uom_type === 'binary' ? scoring.qualitative_options : null,
      r5: scoring.r5, r4: scoring.r4, r3: scoring.r3, r2: scoring.r2, r1: scoring.r1, r0: scoring.r0,
      uom,
      target_value: target,
      weightage,
    };
    return diffChanges(original, next, GROUP_EDIT_FIELDS as unknown as string[]);
  }, [text, scoring, uom, target, weightage, original]);

  const changedFields = Object.keys(changes);
  const affected = preview?.will_write ?? 0;
  const bigScope = needsTypedConfirmation(preview);
  const confirmed = confirmationSatisfied(preview, confirmText);
  const weightRows = uniqueByEmployee(preview?.weightage_impact);
  const deviations = weightageDeviations(weightRows);

  const runPreview = () => {
    if (!args || !hasChanges(changes)) return;
    previewMut.mutate(
      { ...baseArgs(args), changes, allowLocked, resetOverrides },
      { onSuccess: (res) => { setPreview(res); setConfirmText(''); } },
    );
  };

  const runCommit = () => {
    if (!args || !preview) return;
    commitMut.mutate(
      { ...baseArgs(args), changes, allowLocked, resetOverrides },
      { onSuccess: () => onOpenChange(false) },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit definition for the whole group</DialogTitle>
          <DialogDescription>
            Only the fields you change are written. The legacy KPI name is kept as-is so history,
            reports and Org KPI matching keep working.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <KpiTextSplitFields value={text} onChange={setText} hideName />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Weightage (leave blank to keep each employee's own)</Label>
              <Input
                value={weightage}
                onChange={(e) => { setWeightage(e.target.value); setPreview(null); }}
                inputMode="decimal"
                placeholder="unchanged"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Target</Label>
              <Input value={target} onChange={(e) => { setTarget(e.target.value); setPreview(null); }} inputMode="decimal" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unit</Label>
              <Input value={uom} onChange={(e) => { setUom(e.target.value); setPreview(null); }} />
            </div>
          </div>

          <KpiScoringEditor value={scoring} onChange={(s) => { setScoring(s); setPreview(null); }} />

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

          {preview && (
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2 text-sm">
                <Badge>{preview.will_write ?? 0} rows will change</Badge>
                <Badge variant="outline">{preview.will_skip ?? 0} skipped</Badge>
              </div>

              {deviations.length > 0 && (
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    {deviations.length} employee{deviations.length === 1 ? '' : 's'} will no longer total 100%
                    weightage. This is allowed, but check the list below.
                  </AlertDescription>
                </Alert>
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
                      This edits <strong>{affected}</strong> employee rows. Type{' '}
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
            disabled={!hasChanges(changes) || previewMut.isPending || !args}
          >
            {previewMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {preview ? 'Refresh preview' : 'Preview changes'}
          </Button>
          <Button
            onClick={runCommit}
            disabled={!preview || affected === 0 || commitMut.isPending || !confirmed}
          >
            {commitMut.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Apply to {affected} rows
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function baseArgs(a: KpiDetailArgs) {
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
