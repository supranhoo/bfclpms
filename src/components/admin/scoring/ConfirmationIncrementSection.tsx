import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { getCurrentAssessmentYear, generateAssessmentYears } from '@/lib/assessmentYear';
import {
  useConfirmationIncrementRule,
  useConfirmationIncrementRuleHistory,
  useSaveConfirmationIncrementRule,
  type ConfirmationRuleScope,
} from '@/hooks/useConfirmationIncrementRule';
import type { ConfirmationTreatment } from '@/lib/confirmationIncrementAdjuster';

const TREATMENTS: Array<{ value: ConfirmationTreatment; label: string; help: string }> = [
  { value: 'ignore', label: 'Ignore Confirmation Increment', help: 'Default behaviour — annual increment is computed as if no confirmation increment was granted.' },
  { value: 'adjust_covered_period', label: 'Adjust Covered Period', help: 'Subtract months already covered by the confirmation increment from the current annual cycle.' },
  { value: 'shift_next_cycle', label: 'Shift Employee to Next Normal Cycle', help: 'No annual increment this AY; employee resumes normal cycle from the next AY.' },
  { value: 'carry_forward_uncovered', label: 'Carry Forward Uncovered Period', help: 'Current-cycle balance plus uncovered months from the prior cycle.' },
];

export function ConfirmationIncrementSection() {
  const ayOptions = useMemo(() => generateAssessmentYears(4), []);
  const [assessmentYear, setAssessmentYear] = useState<string>(getCurrentAssessmentYear());

  // Phase 1 ships with global scope only — scope-cascade UI added once
  // company/category/level pickers are wired in. The DB already supports
  // narrower scopes so future UI can layer on without migration.
  const scope: ConfirmationRuleScope = {
    assessment_year: assessmentYear,
    company_id: null,
    category_id: null,
    level_id: null,
  };

  const { data: rule, isLoading } = useConfirmationIncrementRule(scope);
  const { data: history = [] } = useConfirmationIncrementRuleHistory(scope);
  const save = useSaveConfirmationIncrementRule();

  const [treatment, setTreatment] = useState<ConfirmationTreatment>('ignore');
  const [notes, setNotes] = useState('');

  // Sync local state when the loaded rule changes.
  const ruleKey = rule?.id ?? `${assessmentYear}:none`;
  const [hydratedFor, setHydratedFor] = useState<string | null>(null);
  if (hydratedFor !== ruleKey) {
    setHydratedFor(ruleKey);
    setTreatment(rule?.treatment ?? 'ignore');
    setNotes(rule?.notes ?? '');
  }

  const onSave = () => {
    save.mutate({ scope, treatment, notes, existing: rule ?? null });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Confirmation Increment Adjustment</CardTitle>
        <CardDescription>
          Prevent duplicate increment when an employee already received a salary revision
          on confirmation from Trainee. Choose how the engine should treat that period
          during annual increment calculation.
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
            Scope: <Badge variant="secondary">Global (all companies)</Badge>
          </div>
          {rule ? (
            <Badge variant="outline">Active v{rule.version}</Badge>
          ) : (
            <Badge variant="outline">No rule yet — defaults to “Ignore”</Badge>
          )}
        </div>

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
              <Button onClick={onSave} disabled={save.isPending}>
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