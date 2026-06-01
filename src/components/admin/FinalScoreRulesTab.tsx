import { useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Pencil, Plus, Trash2, Info } from 'lucide-react';
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetFooter,
} from '@/components/ui/sheet';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import {
  useFinalScoreRules,
  useUpsertFinalScoreRule,
  useDeleteFinalScoreRule,
  type WorkflowFinalScoreRule,
  type FinalScoreScopeType,
} from '@/hooks/useFinalScoreRules';
import { useWorkflowTemplates, getStageLabel, type WorkflowTemplate } from '@/hooks/useWorkflowConfig';
import { useDepartments } from '@/hooks/useOrganization';
import {
  resolveFinalScore,
  type FinalScoreRuleType,
  type MissingScorePolicy,
  type WorkflowStageKey,
} from '@/lib/finalScoreResolver';
import { ConfirmDestructiveDialog } from '@/components/ui/ConfirmDestructiveDialog';

const ALL_STAGE_KEYS: WorkflowStageKey[] = [
  'self', 'manager', 'functional_manager', 'skip_level',
  'hr_pms', 'auditor', 'management', 'hr_calibration', 'mgmt_calibration',
];

/** Convert workflow_templates.stages (UI stage names) to resolver stage keys. */
function normaliseStage(stage: string): WorkflowStageKey | null {
  const map: Record<string, WorkflowStageKey> = {
    self_review: 'self',
    manager_check: 'manager',
    functional_manager_check: 'functional_manager',
    skip_level: 'skip_level',
    skip_level_check: 'skip_level',
    hr_pms_check: 'hr_pms',
    hr_pms: 'hr_pms',
    audit: 'auditor',
    auditor: 'auditor',
    management_review: 'management',
    management: 'management',
    hr_calibration: 'hr_calibration',
    mgmt_calibration: 'mgmt_calibration',
  };
  return map[stage] ?? null;
}

function stagesFromTemplate(t?: WorkflowTemplate | null): WorkflowStageKey[] {
  if (!t) return [];
  return (t.stages || [])
    .map(normaliseStage)
    .filter((s): s is WorkflowStageKey => !!s);
}

const RULE_GROUPS: Array<{ label: string; options: Array<{ value: FinalScoreRuleType; label: string }> }> = [
  {
    label: 'Single stage',
    options: [
      { value: 'terminal_stage', label: 'Last completed stage (default — current behavior)' },
      { value: 'self_final', label: 'Self rating final' },
      { value: 'manager_final', label: 'Manager / L1 rating final' },
      { value: 'functional_manager_final', label: 'Functional Manager rating final' },
      { value: 'skip_level_final', label: 'Skip Manager / L2 rating final' },
      { value: 'hr_pms_final', label: 'HR PMS rating final' },
      { value: 'auditor_final', label: 'Auditor rating final' },
      { value: 'management_final', label: 'Management rating final' },
      { value: 'hr_calibration_final', label: 'HR calibration final' },
      { value: 'mgmt_calibration_final', label: 'Management calibration final' },
    ],
  },
  {
    label: 'Averages',
    options: [
      { value: 'avg_manager_skip', label: 'Average of Manager and Skip Manager' },
      { value: 'avg_self_manager_skip', label: 'Average of Self, Manager, and Skip Manager' },
      { value: 'avg_all_completed', label: 'Average of all completed reviewer stages' },
    ],
  },
  {
    label: 'Weighted',
    options: [
      { value: 'weighted_custom', label: 'Custom weighted rule' },
    ],
  },
];

function ruleSummary(rule: WorkflowFinalScoreRule): string {
  if (rule.rule_type === 'terminal_stage') return 'Last completed stage';
  if (rule.rule_type === 'weighted_custom') {
    const parts = Object.entries(rule.stage_weights || {})
      .filter(([, w]) => (w ?? 0) > 0)
      .map(([s, w]) => `${getStageLabel(s)} ${w}%`);
    return parts.length ? `Weighted: ${parts.join(' + ')}` : 'Weighted (empty)';
  }
  const flat = RULE_GROUPS.flatMap(g => g.options).find(o => o.value === rule.rule_type);
  return flat?.label ?? rule.rule_type;
}

const MONTHS = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December',
];

export function FinalScoreRulesTab() {
  const { data: rules, isLoading } = useFinalScoreRules();
  const { data: templates } = useWorkflowTemplates();
  const { data: departments } = useDepartments();

  const [editing, setEditing] = useState<WorkflowFinalScoreRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<WorkflowFinalScoreRule | null>(null);
  const deleteMut = useDeleteFinalScoreRule();

  const [filterScope, setFilterScope] = useState<'all' | FinalScoreScopeType>('all');
  const [filterTemplate, setFilterTemplate] = useState<string>('all');

  const filteredRules = useMemo(() => {
    return (rules || []).filter(r =>
      (filterScope === 'all' || r.scope_type === filterScope) &&
      (filterTemplate === 'all' || r.workflow_template_id === filterTemplate),
    );
  }, [rules, filterScope, filterTemplate]);

  const templateMap = useMemo(() => {
    const m = new Map<string, WorkflowTemplate>();
    (templates || []).forEach(t => m.set(t.id, t));
    return m;
  }, [templates]);

  return (
    <div className="space-y-4">
      <Alert>
        <Info className="h-4 w-4" />
        <AlertDescription>
          When no rule is configured for a scope, approvals use the current
          behavior: the last completed review stage becomes the final score.
          Historical approved scores are never changed by these rules.
        </AlertDescription>
      </Alert>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-4 flex-wrap">
            <div>
              <CardTitle>Final Score Rules</CardTitle>
              <CardDescription>
                Configure how the approved KPI final score is derived per
                template, department, PMS grade, or employee.
              </CardDescription>
            </div>
            <Button onClick={() => setCreating(true)}>
              <Plus className="h-4 w-4 mr-2" /> New Rule
            </Button>
          </div>
          <div className="flex items-end gap-3 flex-wrap pt-4">
            <div className="space-y-1">
              <Label className="text-xs">Scope</Label>
              <Select value={filterScope} onValueChange={(v) => setFilterScope(v as 'all' | FinalScoreScopeType)}>
                <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All scopes</SelectItem>
                  <SelectItem value="template">Workflow Template</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="pms_grade">PMS Grade</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Workflow Template</Label>
              <Select value={filterTemplate} onValueChange={setFilterTemplate}>
                <SelectTrigger className="w-[220px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All templates</SelectItem>
                  {(templates || []).map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Loading rules…</p>
          ) : filteredRules.length === 0 ? (
            <div className="border rounded-md p-8 text-center text-sm text-muted-foreground">
              No custom rules configured. All approvals will use the last
              completed stage score.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Scope</TableHead>
                  <TableHead>Applied To</TableHead>
                  <TableHead>Template</TableHead>
                  <TableHead>Period</TableHead>
                  <TableHead>Rule</TableHead>
                  <TableHead>Missing</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredRules.map(r => {
                  const t = templateMap.get(r.workflow_template_id);
                  return (
                    <TableRow key={r.id}>
                      <TableCell className="capitalize">{r.scope_type.replace('_', ' ')}</TableCell>
                      <TableCell>{r.scope_value || (r.scope_type === 'template' ? t?.display_name ?? '—' : '—')}</TableCell>
                      <TableCell>{t?.display_name ?? '—'}</TableCell>
                      <TableCell>
                        {r.review_period && r.review_year
                          ? `${r.review_period} ${r.review_year}`
                          : <Badge variant="outline">Ongoing</Badge>}
                      </TableCell>
                      <TableCell>{ruleSummary(r)}</TableCell>
                      <TableCell><Badge variant="outline">{r.missing_score_policy}</Badge></TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon" onClick={() => setEditing(r)} aria-label="Edit rule">
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(r)} aria-label="Delete rule">
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <RuleBuilderSheet
        open={creating || !!editing}
        onClose={() => { setCreating(false); setEditing(null); }}
        existing={editing}
        templates={templates || []}
        departments={departments || []}
      />

      <ConfirmDestructiveDialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title="Delete final score rule?"
        description="Existing approved scores will not change. Future approvals in this scope will use the default last-completed-stage behavior unless another rule applies."
        confirmText="Delete rule"
        onConfirm={async () => {
          if (!deleteTarget) return;
          await deleteMut.mutateAsync(deleteTarget.id);
          setDeleteTarget(null);
        }}
      />
    </div>
  );
}

// =========================================================================
// Rule Builder
// =========================================================================
function RuleBuilderSheet({
  open, onClose, existing, templates, departments,
}: {
  open: boolean;
  onClose: () => void;
  existing: WorkflowFinalScoreRule | null;
  templates: WorkflowTemplate[];
  departments: Array<{ name: string }>;
}) {
  const upsert = useUpsertFinalScoreRule();

  const [scopeType, setScopeType] = useState<FinalScoreScopeType>(existing?.scope_type ?? 'template');
  const [scopeValue, setScopeValue] = useState<string>(existing?.scope_value ?? '');
  const [templateId, setTemplateId] = useState<string>(existing?.workflow_template_id ?? '');
  const [reviewPeriod, setReviewPeriod] = useState<string>(existing?.review_period ?? '');
  const [reviewYear, setReviewYear] = useState<string>(existing?.review_year ? String(existing.review_year) : '');
  const [ongoing, setOngoing] = useState<boolean>(!existing?.review_period);
  const [ruleType, setRuleType] = useState<FinalScoreRuleType>(existing?.rule_type ?? 'terminal_stage');
  const [weights, setWeights] = useState<Partial<Record<WorkflowStageKey, number>>>(existing?.stage_weights ?? {});
  const [policy, setPolicy] = useState<MissingScorePolicy>(existing?.missing_score_policy ?? 'block');

  // Reset state when opening for a different record
  useState(() => {
    if (!existing) return;
    setScopeType(existing.scope_type);
    setScopeValue(existing.scope_value ?? '');
    setTemplateId(existing.workflow_template_id);
    setReviewPeriod(existing.review_period ?? '');
    setReviewYear(existing.review_year ? String(existing.review_year) : '');
    setOngoing(!existing.review_period);
    setRuleType(existing.rule_type);
    setWeights(existing.stage_weights ?? {});
    setPolicy(existing.missing_score_policy);
  });

  const template = templates.find(t => t.id === templateId) || null;
  const stageKeys = stagesFromTemplate(template);

  const totalWeight = useMemo(
    () => Object.values(weights).reduce<number>((s, n) => s + (n ?? 0), 0),
    [weights],
  );
  const weightedValid = ruleType !== 'weighted_custom' || totalWeight === 100;

  const scopeValueValid = scopeType === 'template' ? true : !!scopeValue.trim();
  const periodValid = ongoing || (!!reviewPeriod && !!reviewYear);
  const canSave = !!templateId && scopeValueValid && periodValid && weightedValid && !upsert.isPending;

  // Live preview with sample scores
  const sampleScores: Partial<Record<WorkflowStageKey, number>> = {
    self: 3.5, manager: 4.0, functional_manager: 3.8, skip_level: 3.5,
    hr_pms: 4.2, auditor: 4.0, management: 4.5,
  };
  const previewSubset: Partial<Record<WorkflowStageKey, number>> = {};
  stageKeys.forEach(k => { if (sampleScores[k] !== undefined) previewSubset[k] = sampleScores[k]!; });
  const preview = resolveFinalScore({
    stageScores: previewSubset,
    workflowStages: stageKeys.length ? stageKeys : ALL_STAGE_KEYS,
    rule: { type: ruleType, stage_weights: weights, missing_score_policy: policy },
  });

  function handleSave() {
    upsert.mutate({
      id: existing?.id,
      scope_type: scopeType,
      scope_value: scopeType === 'template' ? null : scopeValue.trim() || null,
      workflow_template_id: templateId,
      review_period: ongoing ? null : reviewPeriod,
      review_year: ongoing ? null : Number(reviewYear),
      rule_type: ruleType,
      stage_weights: ruleType === 'weighted_custom' ? weights : null,
      missing_score_policy: policy,
    }, { onSuccess: onClose });
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle>Configure Final Score Rule</SheetTitle>
          <SheetDescription>
            Define how the approved KPI final score should be computed for the
            chosen scope. Stages outside the selected workflow are disabled.
          </SheetDescription>
        </SheetHeader>

        <div className="space-y-6 py-4">
          {/* Context */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Scope</Label>
              <Select value={scopeType} onValueChange={(v) => { setScopeType(v as FinalScoreScopeType); setScopeValue(''); }}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="template">Workflow Template (default)</SelectItem>
                  <SelectItem value="pms_grade">PMS Grade</SelectItem>
                  <SelectItem value="department">Department</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Workflow Template</Label>
              <Select value={templateId} onValueChange={setTemplateId}>
                <SelectTrigger><SelectValue placeholder="Select template…" /></SelectTrigger>
                <SelectContent>
                  {templates.map(t => (
                    <SelectItem key={t.id} value={t.id}>{t.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {scopeType !== 'template' && (
              <div className="space-y-2 col-span-2">
                <Label>Applied To</Label>
                {scopeType === 'department' ? (
                  <Select value={scopeValue} onValueChange={setScopeValue}>
                    <SelectTrigger><SelectValue placeholder="Select department…" /></SelectTrigger>
                    <SelectContent>
                      {departments.map(d => (
                        <SelectItem key={d.name} value={d.name}>{d.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={scopeValue}
                    onChange={(e) => setScopeValue(e.target.value)}
                    placeholder={scopeType === 'employee' ? 'Employee UUID or code' : 'PMS grade name'}
                  />
                )}
              </div>
            )}

            <div className="space-y-2 col-span-2">
              <div className="flex items-center gap-3">
                <Checkbox id="ongoing" checked={ongoing} onCheckedChange={(c) => setOngoing(c === true)} />
                <Label htmlFor="ongoing" className="cursor-pointer">Ongoing (applies to all periods)</Label>
              </div>
              {!ongoing && (
                <div className="grid grid-cols-2 gap-3">
                  <Select value={reviewPeriod} onValueChange={setReviewPeriod}>
                    <SelectTrigger><SelectValue placeholder="Month" /></SelectTrigger>
                    <SelectContent>
                      {MONTHS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    value={reviewYear}
                    onChange={(e) => setReviewYear(e.target.value)}
                    placeholder="Year e.g. 2026"
                  />
                </div>
              )}
            </div>
          </div>

          {template && (
            <div className="text-xs text-muted-foreground">
              Stages in this workflow:{' '}
              {stageKeys.length ? stageKeys.map(getStageLabel).join(' → ') : 'None resolvable'}
            </div>
          )}

          <Separator />

          {/* Rule Type */}
          <div className="space-y-3">
            <Label className="text-base">Rule Type</Label>
            <RadioGroup value={ruleType} onValueChange={(v) => setRuleType(v as FinalScoreRuleType)}>
              {RULE_GROUPS.map(group => (
                <div key={group.label} className="space-y-2">
                  <div className="text-xs font-medium text-muted-foreground uppercase">{group.label}</div>
                  {group.options.map(opt => {
                    const stage = SINGLE_STAGE_MAP[opt.value];
                    const disabled = stage && stageKeys.length > 0 && !stageKeys.includes(stage);
                    return (
                      <label
                        key={opt.value}
                        className={`flex items-center gap-2 text-sm rounded-md p-2 hover:bg-accent cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        <RadioGroupItem value={opt.value} disabled={!!disabled} />
                        <span>{opt.label}</span>
                        {disabled && <Badge variant="outline" className="ml-auto text-xs">Not in workflow</Badge>}
                      </label>
                    );
                  })}
                </div>
              ))}
            </RadioGroup>
          </div>

          {/* Weighted panel */}
          {ruleType === 'weighted_custom' && (
            <div className="space-y-3">
              <Label className="text-base">Stage Weights</Label>
              <div className="border rounded-md overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Stage</TableHead>
                      <TableHead className="w-24 text-center">Include</TableHead>
                      <TableHead className="w-32 text-right">Weight %</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {ALL_STAGE_KEYS.map(stage => {
                      const inWf = stageKeys.length === 0 || stageKeys.includes(stage);
                      const w = weights[stage] ?? 0;
                      const included = (weights[stage] ?? 0) > 0;
                      return (
                        <TableRow key={stage} className={!inWf ? 'opacity-50' : ''}>
                          <TableCell>
                            {getStageLabel(stage)}
                            {!inWf && <Badge variant="outline" className="ml-2 text-xs">N/A</Badge>}
                          </TableCell>
                          <TableCell className="text-center">
                            <Checkbox
                              checked={included}
                              disabled={!inWf}
                              onCheckedChange={(c) => {
                                setWeights(prev => {
                                  const next = { ...prev };
                                  if (c === true) next[stage] = next[stage] ?? 0;
                                  else delete next[stage];
                                  return next;
                                });
                              }}
                            />
                          </TableCell>
                          <TableCell className="text-right">
                            <Input
                              type="number"
                              min={0}
                              max={100}
                              value={included ? w : ''}
                              disabled={!inWf || !included}
                              onChange={(e) => {
                                const n = Number(e.target.value);
                                setWeights(prev => ({ ...prev, [stage]: Number.isFinite(n) ? n : 0 }));
                              }}
                              className="w-24 ml-auto"
                            />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
              <div className={`text-sm ${weightedValid ? 'text-muted-foreground' : 'text-destructive'}`}>
                Total: {totalWeight}% {weightedValid ? '✓' : '— must equal 100%'}
              </div>
            </div>
          )}

          {/* Missing-score policy */}
          <div className="space-y-2">
            <Label>Missing reviewer score behavior</Label>
            <RadioGroup value={policy} onValueChange={(v) => setPolicy(v as MissingScorePolicy)} className="grid grid-cols-3 gap-2">
              <label className="flex items-center gap-2 text-sm border rounded p-2 cursor-pointer">
                <RadioGroupItem value="block" /> Block approval
              </label>
              <label className="flex items-center gap-2 text-sm border rounded p-2 cursor-pointer">
                <RadioGroupItem value="zero" /> Treat as 0
              </label>
              <label className="flex items-center gap-2 text-sm border rounded p-2 cursor-pointer">
                <RadioGroupItem value="ignore" /> Ignore & renormalise
              </label>
            </RadioGroup>
          </div>

          <Separator />

          {/* Live preview */}
          <Card className="bg-muted/50">
            <CardHeader>
              <CardTitle className="text-sm">Live preview (sample reviewer scores)</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              <div className="text-xs text-muted-foreground">
                {Object.entries(previewSubset).map(([s, v]) => `${getStageLabel(s)}=${v}`).join(' · ') || 'No stages'}
              </div>
              <div>
                <span className="font-medium">Final score: </span>
                {preview.final_score ?? '—'}{' '}
                {preview.final_rating && <Badge variant="outline" className="ml-2 capitalize">{preview.final_rating}</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">{preview.explanation}</div>
              {preview.blocked && (
                <div className="text-xs text-destructive">Blocked: {preview.blocked.reason}</div>
              )}
              {preview.missing_warnings.length > 0 && (
                <div className="text-xs text-muted-foreground">
                  Warnings: {preview.missing_warnings.map(w => `${w.stage}(${w.reason})`).join(', ')}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={handleSave} disabled={!canSave}>
            {upsert.isPending ? 'Saving…' : 'Save Rule'}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

const SINGLE_STAGE_MAP: Partial<Record<FinalScoreRuleType, WorkflowStageKey>> = {
  self_final: 'self',
  manager_final: 'manager',
  functional_manager_final: 'functional_manager',
  skip_level_final: 'skip_level',
  hr_pms_final: 'hr_pms',
  auditor_final: 'auditor',
  management_final: 'management',
  hr_calibration_final: 'hr_calibration',
  mgmt_calibration_final: 'mgmt_calibration',
};