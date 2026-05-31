import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';
import { getCurrentAssessmentYear, generateAssessmentYears } from '@/lib/assessmentYear';
import {
  useConfirmationIncrementRule,
  useConfirmationIncrementRuleHistory,
  useSaveConfirmationIncrementRule,
  useConfirmationIncrementRuleExists,
  type ConfirmationRuleScope,
} from '@/hooks/useConfirmationIncrementRule';
import {
  TRANSITION_LABELS,
  type ConfirmationTransition,
  type ConfirmationTreatment,
} from '@/lib/confirmationIncrementAdjuster';
import { useCompanies } from '@/hooks/useCompanies';

const TREATMENTS: Array<{ value: ConfirmationTreatment; label: string; help: string }> = [
  { value: 'ignore', label: 'Ignore Confirmation Increment', help: 'Default behaviour — annual increment is computed as if no confirmation increment was granted.' },
  { value: 'adjust_covered_period', label: 'Adjust Covered Period', help: 'Subtract months already covered by the confirmation increment from the current annual cycle.' },
  { value: 'shift_next_cycle', label: 'Shift Employee to Next Normal Cycle', help: 'No annual increment this AY; employee resumes normal cycle from the next AY.' },
  { value: 'carry_forward_uncovered', label: 'Carry Forward Uncovered Period', help: 'Current-cycle balance plus uncovered months from the prior cycle.' },
];

const ALL_TRANSITIONS: ConfirmationTransition[] = [
  'trainee_to_confirmed',
  'probation_to_confirmed',
  'contract_to_confirmed',
  'apprenticeship_to_confirmed',
];

type CompanyScopeMode = 'global' | 'selected' | 'per_company';

export function ConfirmationIncrementSection() {
  const ayOptions = useMemo(() => generateAssessmentYears(4), []);
  const [assessmentYear, setAssessmentYear] = useState<string>(getCurrentAssessmentYear());
  const { data: companies = [] } = useCompanies();

  const [companyScopeMode, setCompanyScopeMode] = useState<CompanyScopeMode>('global');
  const [selectedCompanyIds, setSelectedCompanyIds] = useState<string[]>([]);
  const [perCompanyId, setPerCompanyId] = useState<string | null>(null);
  const [configureIntent, setConfigureIntent] = useState(false);

  // Scope used for reading/writing the rule row. Only `per_company` mode
  // narrows the DB scope by company_id — `selected` keeps the rule global
  // and stores company list in `selected_company_ids`.
  const scope: ConfirmationRuleScope = {
    assessment_year: assessmentYear,
    company_id: companyScopeMode === 'per_company' ? perCompanyId : null,
    category_id: null,
    level_id: null,
  };

  const ruleEnabled = companyScopeMode !== 'per_company' || !!perCompanyId;
  const { data: rule, isLoading } = useConfirmationIncrementRule(
    ruleEnabled ? scope : null,
  );
  const { data: history = [] } = useConfirmationIncrementRuleHistory(scope);
  const save = useSaveConfirmationIncrementRule();
  const { data: anyRuleExists, isLoading: existsLoading } =
    useConfirmationIncrementRuleExists(assessmentYear);

  const [treatment, setTreatment] = useState<ConfirmationTreatment>('ignore');
  const [notes, setNotes] = useState('');
  const [applicableTransitions, setApplicableTransitions] =
    useState<ConfirmationTransition[]>(['trainee_to_confirmed']);

  // Sync local state when the loaded rule changes.
  const ruleKey = rule?.id ?? `${assessmentYear}:${companyScopeMode}:${perCompanyId ?? 'none'}`;
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  const showEmptyState =
    !existsLoading && anyRuleExists === false && !configureIntent;

  const handleAyChange = (v: string) => {
    setAssessmentYear(v);
    setConfigureIntent(false);
    setCompanyScopeMode('global');
    setSelectedCompanyIds([]);
    setPerCompanyId(null);
    setHydratedFor(null);
  };
  if (hydratedFor !== ruleKey) {
    setHydratedFor(ruleKey);
    setTreatment(rule?.treatment ?? 'ignore');
    setNotes(rule?.notes ?? '');
    setApplicableTransitions(
      rule?.applicable_transitions?.length
        ? (rule.applicable_transitions as ConfirmationTransition[])
        : ['trainee_to_confirmed'],
    );
    if (rule?.company_scope_mode) setCompanyScopeMode(rule.company_scope_mode);
    if (rule?.selected_company_ids) setSelectedCompanyIds(rule.selected_company_ids);
  }

  const toggleTransition = (t: ConfirmationTransition) => {
    setApplicableTransitions((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t],
    );
  };

  const toggleSelectedCompany = (id: string) => {
    setSelectedCompanyIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const canSave =
    applicableTransitions.length > 0 &&
    (companyScopeMode !== 'selected' || selectedCompanyIds.length > 0) &&
    (companyScopeMode !== 'per_company' || !!perCompanyId);

  const onSave = () => {
    save.mutate({
      scope,
      treatment,
      notes,
      existing: rule ?? null,
      applicableTransitions,
      companyScopeMode,
      selectedCompanyIds: companyScopeMode === 'selected' ? selectedCompanyIds : [],
    });
  };

  const scopeSummary =
    companyScopeMode === 'global'
      ? 'Global (all companies)'
      : companyScopeMode === 'selected'
        ? `Selected (${selectedCompanyIds.length} compan${selectedCompanyIds.length === 1 ? 'y' : 'ies'})`
        : perCompanyId
          ? `Per-company: ${companies.find((c) => c.id === perCompanyId)?.name ?? '—'}`
          : 'Per-company (pick a company)';

  const appliesToSummary = applicableTransitions.length
    ? applicableTransitions.map((t) => TRANSITION_LABELS[t]).join(', ')
    : 'None — rule inactive';

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirmation Increment Adjustment</CardTitle>
        <CardDescription>
          Prevent duplicate increment when an employee already received a salary revision
          on confirmation. Choose which status transitions the rule applies to, scope it
          by company, and pick how the engine should treat the covered period during
          annual increment calculation.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="flex flex-wrap items-end gap-4">
          <div className="space-y-1">
            <Label>Assessment Year</Label>
            <Select value={assessmentYear} onValueChange={setAssessmentYear}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {ayOptions.map((y) => (
                  <SelectItem key={y} value={y}>{y}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="text-sm text-muted-foreground">
            Scope: <Badge variant="secondary">{scopeSummary}</Badge>
          </div>
          {rule ? (
            <Badge variant="outline">Active v{rule.version}</Badge>
          ) : (
            <Badge variant="outline">No rule yet — defaults to “Ignore”</Badge>
          )}
        </div>

        <Separator />

        {/* Company Scope */}
        <div className="space-y-3">
          <Label>Company Scope</Label>
          <RadioGroup
            value={companyScopeMode}
            onValueChange={(v) => setCompanyScopeMode(v as CompanyScopeMode)}
            className="grid gap-2 md:grid-cols-3"
          >
            {([
              { v: 'global', label: 'Global (all companies)', help: 'One rule applies everywhere.' },
              { v: 'selected', label: 'Selected companies', help: 'Same rule, restricted to chosen companies.' },
              { v: 'per_company', label: 'Per-company rule', help: 'Maintain a separate rule for one company.' },
            ] as const).map((opt) => (
              <label key={opt.v} className="flex items-start gap-2 rounded-md border p-3 hover:bg-muted/40 cursor-pointer">
                <RadioGroupItem value={opt.v} className="mt-1" />
                <div>
                  <div className="text-sm font-medium">{opt.label}</div>
                  <div className="text-xs text-muted-foreground">{opt.help}</div>
                </div>
              </label>
            ))}
          </RadioGroup>

          {companyScopeMode === 'selected' && (
            <div className="rounded-md border p-3 space-y-2">
              <Label className="text-xs uppercase text-muted-foreground">Companies</Label>
              <div className="grid gap-2 sm:grid-cols-2 md:grid-cols-3">
                {companies.map((c) => (
                  <label key={c.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={selectedCompanyIds.includes(c.id)}
                      onCheckedChange={() => toggleSelectedCompany(c.id)}
                    />
                    <span>{c.name}</span>
                  </label>
                ))}
                {companies.length === 0 && (
                  <span className="text-xs text-muted-foreground">No companies configured.</span>
                )}
              </div>
            </div>
          )}

          {companyScopeMode === 'per_company' && (
            <div className="flex items-end gap-3">
              <div className="space-y-1">
                <Label>Company</Label>
                <Select value={perCompanyId ?? ''} onValueChange={(v) => setPerCompanyId(v || null)}>
                  <SelectTrigger className="w-64"><SelectValue placeholder="Select a company" /></SelectTrigger>
                  <SelectContent>
                    {companies.map((c) => (
                      <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          )}
        </div>

        <Separator />

        {/* Applicable Transitions */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Applicable Confirmation Type(s) <span className="text-destructive">*</span></Label>
            <span className="text-xs text-muted-foreground">
              Rule Applies To: <Badge variant="secondary">{appliesToSummary}</Badge>
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {ALL_TRANSITIONS.map((t) => (
              <label key={t} className="flex items-start gap-2 rounded-md border p-3 hover:bg-muted/40 cursor-pointer">
                <Checkbox
                  checked={applicableTransitions.includes(t)}
                  onCheckedChange={() => toggleTransition(t)}
                  className="mt-0.5"
                />
                <div className="text-sm font-medium">{TRANSITION_LABELS[t]}</div>
              </label>
            ))}
          </div>
          {applicableTransitions.length === 0 && (
            <p className="text-xs text-destructive">
              Select at least one transition — otherwise the rule will never apply.
            </p>
          )}
        </div>

        <Separator />

        {isLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" /> Loading rule…
          </div>
        ) : (
          <>
            <div className="space-y-2">
              <Label>Treatment</Label>
              <RadioGroup
                value={treatment}
                onValueChange={(v) => setTreatment(v as ConfirmationTreatment)}
                className="space-y-3"
              >
                {TREATMENTS.map((t) => (
                  <label
                    key={t.value}
                    className="flex items-start gap-3 rounded-md border p-3 hover:bg-muted/40 cursor-pointer"
                  >
                    <RadioGroupItem value={t.value} className="mt-1" />
                    <div className="space-y-1">
                      <div className="text-sm font-medium">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.help}</div>
                    </div>
                  </label>
                ))}
              </RadioGroup>
            </div>

            <div className="space-y-1">
              <Label htmlFor="conf-inc-notes">Notes (optional)</Label>
              <Textarea
                id="conf-inc-notes"
                rows={2}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Audit / policy reference"
              />
            </div>

            <div className="flex justify-end">
              <Button onClick={onSave} disabled={save.isPending || !canSave}>
                {save.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save as new version
              </Button>
            </div>

            {history.length > 0 && (
              <div className="space-y-2">
                <Label className="text-xs uppercase text-muted-foreground">Version history</Label>
                <div className="rounded-md border divide-y">
                  {history.map((h) => (
                    <div key={h.id} className="flex items-center justify-between p-2 text-xs">
                      <span>v{h.version} · {TREATMENTS.find(t => t.value === h.treatment)?.label}</span>
                      <span className="text-muted-foreground">
                        {h.status} · {new Date(h.created_at).toLocaleDateString()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

export default ConfirmationIncrementSection;