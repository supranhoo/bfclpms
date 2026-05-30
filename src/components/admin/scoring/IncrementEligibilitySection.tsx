import { useMemo, useState } from 'react';
import { format } from 'date-fns';
import { ShieldCheck, Plus, Pencil, Trash2, Copy, History, ScrollText, Loader2, Save, CheckCircle2, XCircle, Send } from 'lucide-react';
import { Unlock } from 'lucide-react';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { MultiSelectFilter } from '@/components/review/MultiSelectFilter';
import { Building2, Network, Factory, Layers, MapPin } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';
import { ExclusionsCard } from '@/components/admin/scoring/ExclusionsCard';

import {
  useEligibilityConfig,
  useEligibilityCriteria,
  useEligibilityMasters,
  useEligibilityAudit,
  useEligibilityVersionHistory,
  useKnownAssessmentYears,
  useCreateEligibilityConfig,
  useCopyEligibilityConfig,
  useUpsertCriterion,
  useDeleteCriterion,
  useUpdateConfigStatus,
  generateAssessmentYears,
  type EligibilityScope,
  type EligibilityCriterionRow,
  type EligibilityConfigRow,
} from '@/hooks/useIncrementEligibility';
import type { ComparisonOperator } from '@/lib/incrementEligibility';

const OPERATORS: Array<{ value: ComparisonOperator; label: string }> = [
  { value: '>=', label: '≥' },
  { value: '<=', label: '≤' },
  { value: '>',  label: '>' },
  { value: '<',  label: '<' },
  { value: '=',  label: '=' },
];

function opLabel(op: ComparisonOperator) {
  return OPERATORS.find((o) => o.value === op)?.label ?? op;
}

function statusBadge(status: EligibilityConfigRow['status']) {
  const map: Record<EligibilityConfigRow['status'], { label: string; variant: 'secondary' | 'default' | 'outline' | 'destructive' }> = {
    draft:            { label: 'Draft',            variant: 'secondary' },
    pending_approval: { label: 'Pending Approval', variant: 'outline'   },
    approved:         { label: 'Approved',         variant: 'default'   },
    archived:         { label: 'Archived',         variant: 'outline'   },
  };
  const m = map[status];
  return <Badge variant={m.variant}>{m.label}</Badge>;
}

export function IncrementEligibilitySection() {
  const { data: masters } = useEligibilityMasters();
  const { data: knownYears = [] } = useKnownAssessmentYears();

  const years = useMemo(() => {
    const seeded = generateAssessmentYears(4);
    const merged = Array.from(new Set([...knownYears, ...seeded]));
    return merged.sort().reverse();
  }, [knownYears]);

  // Filter inputs (draft) vs applied scope
  const [draft, setDraft] = useState<EligibilityScope>({
    company_id: [], division_id: [], business_unit_id: [],
    level_id: [], category_id: [], location_id: [],
    assessment_year: years[0] ?? '',
  });
  const [scope, setScope] = useState<EligibilityScope | null>(null);

  const { data: config, isLoading: loadingConfig } = useEligibilityConfig(scope);
  const { data: criteria = [], isLoading: loadingCriteria } = useEligibilityCriteria(config?.id ?? null);
  const { data: history = [] } = useEligibilityVersionHistory(scope);

  const createConfig = useCreateEligibilityConfig();
  const copyConfig = useCopyEligibilityConfig();
  const upsertCrit = useUpsertCriterion();
  const deleteCrit = useDeleteCriterion();
  const updateStatus = useUpdateConfigStatus();

  // Dialogs / drawers
  const [criterionDialog, setCriterionDialog] = useState<{ open: boolean; row: EligibilityCriterionRow | null }>({ open: false, row: null });
  const [deleteTarget, setDeleteTarget] = useState<EligibilityCriterionRow | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [revertOpen, setRevertOpen] = useState(false);

  // Copy-from-previous-year UI
  const [copyMode, setCopyMode] = useState<'no' | 'yes'>('no');
  const [copySourceId, setCopySourceId] = useState<string>('');

  function handleLoad() {
    if (!draft.assessment_year) return;
    setScope({ ...draft });
  }
  function handleReset() {
    setDraft({
      company_id: [], division_id: [], business_unit_id: [],
      level_id: [], category_id: [], location_id: [],
      assessment_year: years[0] ?? '',
    });
    setScope(null);
    setCopyMode('no');
    setCopySourceId('');
  }

  const isReadOnly = config?.status === 'approved' || config?.status === 'archived';

  function MultiFilter(props: {
    label: string;
    icon: React.ReactNode;
    values: string[];
    onChange: (next: string[]) => void;
    options: Array<{ id: string; name: string }>;
  }) {
    return (
      <div className="space-y-1.5">
        <Label className="text-xs">{props.label}</Label>
        <MultiSelectFilter
          icon={props.icon}
          label={props.label}
          options={props.options.map((o) => ({ value: o.id, label: o.name }))}
          values={props.values}
          onChange={props.onChange}
          placeholder="All"
          width={220}
        />
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          Increment Eligibility Criteria
        </CardTitle>
        <CardDescription>
          Organization-wide rules that disqualify employees from increments before percentage calculation.
          Configurations are maintained per scope (Company, Division, Business Unit, Level, Location)
          and Assessment Year.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* FILTERS */}
        <div className="rounded-lg border p-3 space-y-3 bg-muted/20">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            <MultiFilter label="Company"       icon={<Building2 className="h-3 w-3 text-muted-foreground" />} values={draft.company_id}       onChange={(v) => setDraft((s) => ({ ...s, company_id: v }))}       options={masters?.companies ?? []} />
            <MultiFilter label="Division"      icon={<Network  className="h-3 w-3 text-muted-foreground" />} values={draft.division_id}      onChange={(v) => setDraft((s) => ({ ...s, division_id: v }))}      options={masters?.divisions ?? []} />
            <MultiFilter label="Business Unit" icon={<Factory  className="h-3 w-3 text-muted-foreground" />} values={draft.business_unit_id} onChange={(v) => setDraft((s) => ({ ...s, business_unit_id: v }))} options={masters?.business_units ?? []} />
            <MultiFilter label="Level"         icon={<Layers   className="h-3 w-3 text-muted-foreground" />} values={draft.level_id}         onChange={(v) => setDraft((s) => ({ ...s, level_id: v }))}         options={masters?.levels ?? []} />
            <MultiFilter label="Location"      icon={<MapPin   className="h-3 w-3 text-muted-foreground" />} values={draft.location_id}      onChange={(v) => setDraft((s) => ({ ...s, location_id: v }))}      options={masters?.locations ?? []} />
            <div className="space-y-1.5">
              <Label className="text-xs">Assessment Year <span className="text-destructive">*</span></Label>
              <Select value={draft.assessment_year} onValueChange={(v) => setDraft((s) => ({ ...s, assessment_year: v }))}>
                <SelectTrigger className="h-9"><SelectValue placeholder="Select year" /></SelectTrigger>
                <SelectContent>
                  {years.map((y) => <SelectItem key={y} value={y}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex items-center justify-end gap-2 pt-1 border-t">
            <Button variant="outline" size="sm" onClick={handleReset}>Reset</Button>
            <Button size="sm" onClick={handleLoad} disabled={!draft.assessment_year}>
              Load / Search
            </Button>
          </div>
        </div>

        {/* CONFIG AREA */}
        {!scope ? (
          <div className="rounded-md border border-dashed p-6 text-sm text-muted-foreground text-center">
            Choose an Assessment Year (and optionally narrow the scope), then click <strong>Load / Search</strong>.
          </div>
        ) : loadingConfig ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading configuration…</div>
        ) : !config ? (
          <div className="rounded-md border border-dashed p-5 space-y-3">
            <p className="text-sm">No configuration exists for this scope and assessment year.</p>

            {/* Copy from previous AY */}
            {history.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs">Copy conditions from previous assessment year?</Label>
                <div className="flex items-center gap-3 flex-wrap">
                  <Select value={copyMode} onValueChange={(v) => setCopyMode(v as 'yes' | 'no')}>
                    <SelectTrigger className="h-9 w-28"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="no">No</SelectItem>
                      <SelectItem value="yes">Yes</SelectItem>
                    </SelectContent>
                  </Select>
                  {copyMode === 'yes' && (
                    <>
                      <Select value={copySourceId} onValueChange={setCopySourceId}>
                        <SelectTrigger className="h-9 w-56"><SelectValue placeholder="Source Assessment Year" /></SelectTrigger>
                        <SelectContent>
                          {history.map((h) => (
                            <SelectItem key={h.id} value={h.id}>{h.assessment_year} ({h.status})</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Button
                        size="sm"
                        onClick={() => copySourceId && copyConfig.mutate({ scope, sourceConfigId: copySourceId })}
                        disabled={!copySourceId || copyConfig.isPending}
                      >
                        <Copy className="h-4 w-4 mr-1" /> Copy
                      </Button>
                    </>
                  )}
                </div>
              </div>
            )}

            <div className="pt-2">
              <Button
                size="sm"
                onClick={() => createConfig.mutate({ scope, seedDefaults: true })}
                disabled={createConfig.isPending}
              >
                <Plus className="h-4 w-4 mr-1" /> Create with default criteria
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="ml-2"
                onClick={() => createConfig.mutate({ scope, seedDefaults: false })}
                disabled={createConfig.isPending}
              >
                Create blank
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* HEADER ROW */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                {statusBadge(config.status)}
                <span>•</span>
                <span>Last saved {format(new Date(config.updated_at), 'dd MMM yyyy HH:mm')}</span>
                {config.copied_from_config_id && (<><span>•</span><span>Copied from previous configuration</span></>)}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => setHistoryOpen(true)}>
                  <History className="h-4 w-4 mr-1" /> Version History
                </Button>
                <Button variant="outline" size="sm" onClick={() => setAuditOpen(true)}>
                  <ScrollText className="h-4 w-4 mr-1" /> Audit Trail
                </Button>
              </div>
            </div>

            {/* CRITERIA TABLE */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-medium">Criteria</h4>
                <Button
                  size="sm"
                  disabled={isReadOnly}
                  onClick={() => setCriterionDialog({ open: true, row: null })}
                >
                  <Plus className="h-4 w-4 mr-1" /> Add Criterion
                </Button>
              </div>
              <ScrollArea className="w-full">
                <div className="rounded-md border min-w-[860px]">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Description</TableHead>
                        <TableHead className="w-16 text-center">Oper.</TableHead>
                        <TableHead className="w-24 text-right">Threshold</TableHead>
                        <TableHead className="w-24">Unit</TableHead>
                        <TableHead className="w-32">Assessment Year</TableHead>
                        <TableHead className="w-20 text-center">Active</TableHead>
                        <TableHead className="w-24 text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {loadingCriteria ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-4">Loading…</TableCell></TableRow>
                      ) : criteria.length === 0 ? (
                        <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground text-sm py-4">No criteria yet. Click “Add Criterion”.</TableCell></TableRow>
                      ) : criteria.map((row) => (
                        <TableRow key={row.id}>
                          <TableCell className="font-medium">{row.criterion_name}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={row.description ?? ''}>{row.description}</TableCell>
                          <TableCell className="text-center">{opLabel(row.comparison_operator)}</TableCell>
                          <TableCell className="text-right tabular-nums">{row.threshold_value}</TableCell>
                          <TableCell className="text-xs">{row.unit_label}</TableCell>
                          <TableCell className="text-xs">{config.assessment_year}</TableCell>
                          <TableCell className="text-center">
                            <Switch
                              checked={row.is_active}
                              disabled={isReadOnly}
                              onCheckedChange={(v) =>
                                upsertCrit.mutate({
                                  id: row.id, config_id: row.config_id,
                                  criterion_key: row.criterion_key, criterion_name: row.criterion_name,
                                  is_active: v,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Button size="icon" variant="ghost" disabled={isReadOnly}
                                    onClick={() => setCriterionDialog({ open: true, row })}>
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" disabled={isReadOnly}
                                    onClick={() => setDeleteTarget(row)}>
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </ScrollArea>
            </div>

            {/* EXCLUDED EMPLOYEES (per-AY) */}
            <ExclusionsCard
              configId={config.id}
              defaultAssessmentYear={config.assessment_year}
              knownYears={years}
              readOnly={isReadOnly}
            />

            {/* STATUS ACTIONS */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-3 border-t">
              {config.status === 'draft' && (
                <>
                  <Button variant="outline" size="sm" disabled>
                    <Save className="h-4 w-4 mr-1" /> Save Draft (auto)
                  </Button>
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: config.id, status: 'pending_approval', action: 'submit', assessment_year: config.assessment_year })}>
                    <Send className="h-4 w-4 mr-1" /> Submit for Approval
                  </Button>
                  <Button size="sm" variant="default" onClick={() => updateStatus.mutate({ id: config.id, status: 'approved', action: 'publish', assessment_year: config.assessment_year })}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Publish
                  </Button>
                </>
              )}
              {config.status === 'pending_approval' && (
                <>
                  <Button size="sm" variant="outline" onClick={() => updateStatus.mutate({ id: config.id, status: 'draft', action: 'reject', assessment_year: config.assessment_year })}>
                    <XCircle className="h-4 w-4 mr-1" /> Reject (back to draft)
                  </Button>
                  <Button size="sm" onClick={() => updateStatus.mutate({ id: config.id, status: 'approved', action: 'approve', assessment_year: config.assessment_year })}>
                    <CheckCircle2 className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </>
              )}
              {config.status === 'approved' && (
                <Button size="sm" variant="outline" onClick={() => setRevertOpen(true)}>
                  <Unlock className="h-4 w-4 mr-1" /> Revert to Draft
                </Button>
              )}
            </div>
          </>
        )}

        {/* CRITERION DIALOG */}
        <CriterionDialog
          open={criterionDialog.open}
          row={criterionDialog.row}
          configId={config?.id ?? ''}
          onClose={() => setCriterionDialog({ open: false, row: null })}
          onSave={(payload) => {
            upsertCrit.mutate(payload, { onSuccess: () => setCriterionDialog({ open: false, row: null }) });
          }}
          isPending={upsertCrit.isPending}
        />

        {/* DELETE CONFIRM */}
        <ConfirmDestructiveDialog
          open={!!deleteTarget}
          onConfirm={() => {
            if (deleteTarget) {
              deleteCrit.mutate(
                { id: deleteTarget.id, config_id: deleteTarget.config_id },
                { onSuccess: () => setDeleteTarget(null) },
              );
            }
          }}
          onCancel={() => setDeleteTarget(null)}
          title="Delete Criterion"
          description={`This will remove "${deleteTarget?.criterion_name}" from the configuration. The deletion will be recorded in the audit trail.`}
          confirmLabel="Delete"
          isLoading={deleteCrit.isPending}
        />

        {/* AUDIT TRAIL DRAWER */}
        <AuditDrawer open={auditOpen} onClose={() => setAuditOpen(false)} configId={config?.id ?? null} />

        {/* REVERT-TO-DRAFT CONFIRM */}
        <ConfirmDestructiveDialog
          open={revertOpen}
          onConfirm={() => {
            if (config) {
              updateStatus.mutate(
                { id: config.id, status: 'draft', action: 'revert_to_draft', assessment_year: config.assessment_year },
                { onSuccess: () => setRevertOpen(false) },
              );
            }
          }}
          onCancel={() => setRevertOpen(false)}
          title="Revert to Draft?"
          description={`This will unlock criteria for editing on the ${config?.assessment_year ?? ''} configuration. The change is recorded in the audit trail, and you will need to re-publish before it takes effect again.`}
          confirmLabel="Revert"
          isLoading={updateStatus.isPending}
        />

        {/* VERSION HISTORY DRAWER */}
        <VersionHistoryDrawer
          open={historyOpen}
          onClose={() => setHistoryOpen(false)}
          history={history}
        />
      </CardContent>
    </Card>
  );
}

/* --------------------------- sub-components --------------------------- */

function CriterionDialog(props: {
  open: boolean;
  row: EligibilityCriterionRow | null;
  configId: string;
  onClose: () => void;
  onSave: (
    payload: Partial<EligibilityCriterionRow> & {
      config_id: string;
      criterion_key: string;
      criterion_name: string;
    },
  ) => void;
  isPending: boolean;
}) {
  const editing = !!props.row;
  const [form, setForm] = useState<{
    criterion_name: string;
    description: string;
    comparison_operator: ComparisonOperator;
    threshold_value: string;
    unit_label: string;
    is_active: boolean;
    effective_date: string;
  }>(() => ({
    criterion_name: props.row?.criterion_name ?? '',
    description: props.row?.description ?? '',
    comparison_operator: (props.row?.comparison_operator as ComparisonOperator) ?? '>=',
    threshold_value: props.row?.threshold_value?.toString() ?? '',
    unit_label: props.row?.unit_label ?? '',
    is_active: props.row?.is_active ?? true,
    effective_date: props.row?.effective_date ?? new Date().toISOString().slice(0, 10),
  }));

  // Reset when opened with a different row
  useMemoResetForm(props.open, props.row, setForm);

  const canSave =
    form.criterion_name.trim().length > 0 &&
    form.threshold_value.trim().length > 0 &&
    !Number.isNaN(Number(form.threshold_value));

  function handleSave() {
    const key = (props.row?.criterion_key ?? form.criterion_name)
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '');
    props.onSave({
      ...(props.row?.id ? { id: props.row.id } : {}),
      config_id: props.configId,
      criterion_key: key,
      criterion_name: form.criterion_name.trim(),
      description: form.description.trim() || null,
      comparison_operator: form.comparison_operator,
      threshold_value: Number(form.threshold_value),
      unit_label: form.unit_label.trim() || null,
      is_active: form.is_active,
      effective_date: form.effective_date,
    });
  }

  return (
    <Dialog open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit Criterion' : 'Add Criterion'}</DialogTitle>
          <DialogDescription>
            Define the rule. Breach triggers <strong>Not Eligible</strong> and zero increment.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Criteria Name <span className="text-destructive">*</span></Label>
            <Input value={form.criterion_name} onChange={(e) => setForm((s) => ({ ...s, criterion_name: e.target.value }))} className="h-9" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Description</Label>
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Operator</Label>
              <Select value={form.comparison_operator} onValueChange={(v) => setForm((s) => ({ ...s, comparison_operator: v as ComparisonOperator }))}>
                <SelectTrigger className="h-9"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Threshold <span className="text-destructive">*</span></Label>
              <Input type="number" value={form.threshold_value} onChange={(e) => setForm((s) => ({ ...s, threshold_value: e.target.value }))} className="h-9" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Unit</Label>
              <Input placeholder="days / programs / %" value={form.unit_label} onChange={(e) => setForm((s) => ({ ...s, unit_label: e.target.value }))} className="h-9" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Active</Label>
              <div className="h-9 flex items-center">
                <Switch checked={form.is_active} onCheckedChange={(v) => setForm((s) => ({ ...s, is_active: v }))} />
                <span className="ml-2 text-sm text-muted-foreground">{form.is_active ? 'Active' : 'Inactive'}</span>
              </div>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave || props.isPending}>
            {props.isPending ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Resets the dialog form when a different row is opened. */
function useMemoResetForm(
  open: boolean,
  row: EligibilityCriterionRow | null,
  setForm: (v: {
    criterion_name: string;
    description: string;
    comparison_operator: ComparisonOperator;
    threshold_value: string;
    unit_label: string;
    is_active: boolean;
    effective_date: string;
  }) => void,
) {
  // useState initializer only runs once; we need to reset on open changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useMemoEffect(() => {
    if (!open) return;
    setForm({
      criterion_name: row?.criterion_name ?? '',
      description: row?.description ?? '',
      comparison_operator: (row?.comparison_operator as ComparisonOperator) ?? '>=',
      threshold_value: row?.threshold_value?.toString() ?? '',
      unit_label: row?.unit_label ?? '',
      is_active: row?.is_active ?? true,
      effective_date: row?.effective_date ?? new Date().toISOString().slice(0, 10),
    });
  }, [open, row?.id]);
}

// Tiny adapter so we don't import useEffect at top — keeps the file self-contained.
import { useEffect as useMemoEffect } from 'react';

function AuditDrawer(props: { open: boolean; onClose: () => void; configId: string | null }) {
  const { data: rows = [], isLoading } = useEligibilityAudit(props.configId);
  return (
    <Sheet open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <SheetContent side="right" className="sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>Audit Trail</SheetTitle>
          <SheetDescription>Every change made to this configuration’s criteria.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] mt-4 pr-3">
          {isLoading ? (
            <div className="text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin inline mr-2" /> Loading…</div>
          ) : rows.length === 0 ? (
            <div className="text-sm text-muted-foreground">No audit events yet.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date &amp; Time</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Previous → Revised</TableHead>
                  <TableHead>AY</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="text-xs">{format(new Date(r.performed_at), 'dd MMM yyyy HH:mm')}</TableCell>
                    <TableCell><Badge variant="outline">{r.action}</Badge></TableCell>
                    <TableCell className="text-xs max-w-[260px]">
                      <details>
                        <summary className="cursor-pointer text-muted-foreground">view JSON</summary>
                        <pre className="whitespace-pre-wrap text-[10px] mt-1">{JSON.stringify({ previous: r.previous_value, revised: r.revised_value }, null, 2)}</pre>
                      </details>
                    </TableCell>
                    <TableCell className="text-xs">{r.assessment_year}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function VersionHistoryDrawer(props: {
  open: boolean;
  onClose: () => void;
  history: EligibilityConfigRow[];
}) {
  return (
    <Sheet open={props.open} onOpenChange={(v) => !v && props.onClose()}>
      <SheetContent side="right" className="sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Version History</SheetTitle>
          <SheetDescription>Prior configurations for this scope, by assessment year.</SheetDescription>
        </SheetHeader>
        <ScrollArea className="h-[calc(100vh-8rem)] mt-4 pr-3">
          {props.history.length === 0 ? (
            <div className="text-sm text-muted-foreground">No prior versions for this scope.</div>
          ) : (
            <div className="space-y-2">
              {props.history.map((h) => (
                <div key={h.id} className="rounded-md border p-3 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium">AY {h.assessment_year}</span>
                    {statusBadge(h.status)}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    Updated {format(new Date(h.updated_at), 'dd MMM yyyy HH:mm')}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

export default IncrementEligibilitySection;