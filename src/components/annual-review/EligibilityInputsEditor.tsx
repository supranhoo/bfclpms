import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Save, AlertCircle } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as svc from '@/services/annualReview/annualReviewService';
import { annualReviewKeys } from '@/hooks/useAnnualReview';
import type { EligibilityCriterion } from '@/types/annualReview';
import { evaluateEligibility } from '@/lib/annualReview/eligibility';

/**
 * HR editor for the per-employee eligibility inputs. Each row corresponds to
 * one EligibilityCriterion defined on the template; the value typed here is
 * persisted into annual_review_instances.eligibility_inputs (jsonb) and used
 * by evaluateEligibility() to decide whether the employee qualifies.
 */
export function EligibilityInputsEditor({
  instanceId,
  criteria,
  initial,
  initialRemark,
}: {
  instanceId: string;
  criteria: EligibilityCriterion[];
  initial: Record<string, string | number | boolean>;
  initialRemark?: string | null;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string | number | boolean>>(initial ?? {});
  const [remark, setRemark] = useState<string>(initialRemark ?? '');
  useEffect(() => { setValues(initial ?? {}); }, [instanceId, initial]);
  useEffect(() => { setRemark(initialRemark ?? ''); }, [instanceId, initialRemark]);

  const save = useMutation({
    mutationFn: () => svc.updateEligibilityInputs(instanceId, values, remark),
    onSuccess: () => {
      toast.success('Eligibility inputs saved');
      qc.invalidateQueries({ queryKey: annualReviewKeys.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (criteria.length === 0) return null;

  const setVal = (id: string, v: string | number | boolean) =>
    setValues((p) => ({ ...p, [id]: v }));

  const result = evaluateEligibility(criteria, values);
  const hasFailures = !result.passed;
  const remarkRequired = hasFailures;
  const remarkMissing = remarkRequired && !remark.trim();

  const onSave = () => {
    if (remarkMissing) {
      toast.error('Please add a remark — at least one eligibility criterion is not met.');
      return;
    }
    save.mutate();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Eligibility Inputs</span>
          <Button size="sm" onClick={onSave} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-2">
        {criteria.map((c) => {
          const raw = values[c.id];
          return (
            <div key={c.id} className="space-y-1 rounded-md border p-3">
              <Label className="text-xs">
                {c.name}
                {c.description ? (
                  <span className="ml-1 text-muted-foreground font-normal">— {c.description}</span>
                ) : (
                  <span className="ml-1 text-muted-foreground font-normal">
                    ({c.operator.replace('_', ' ')} {String(c.expected_value)})
                  </span>
                )}
              </Label>
              {c.type === 'boolean' ? (
                <div className="flex items-center gap-2 h-9">
                  <Switch checked={raw === true} onCheckedChange={(v) => setVal(c.id, v)} />
                  <span className="text-sm text-muted-foreground">{raw === true ? 'Yes' : 'No'}</span>
                </div>
              ) : c.type === 'number' ? (
                <Input
                  type="number"
                  value={raw === undefined || raw === null ? '' : String(raw)}
                  onChange={(e) => setVal(c.id, e.target.value === '' ? '' : Number(e.target.value))}
                />
              ) : (
                <Input
                  value={raw === undefined || raw === null ? '' : String(raw)}
                  onChange={(e) => setVal(c.id, e.target.value)}
                />
              )}
            </div>
          );
        })}
        </div>

        <div className="space-y-1.5">
          <Label className="text-xs flex items-center gap-1">
            Eligibility Remark
            {remarkRequired && <span className="text-destructive">*</span>}
          </Label>
          <Textarea
            value={remark}
            onChange={(e) => setRemark(e.target.value)}
            placeholder="Explain why the employee is/is not eligible (required when any criterion is not met)."
            rows={3}
            className={remarkMissing ? 'border-destructive focus-visible:ring-destructive' : ''}
          />
          {hasFailures && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="h-3 w-3" />
              {result.failures.length} criterion{result.failures.length === 1 ? '' : 's'} not met — remark is required and will be shown to the employee.
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}