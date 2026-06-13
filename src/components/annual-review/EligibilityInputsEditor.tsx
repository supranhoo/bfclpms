import { useEffect, useState } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Save } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import * as svc from '@/services/annualReview/annualReviewService';
import { annualReviewKeys } from '@/hooks/useAnnualReview';
import type { EligibilityCriterion } from '@/types/annualReview';

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
}: {
  instanceId: string;
  criteria: EligibilityCriterion[];
  initial: Record<string, string | number | boolean>;
}) {
  const qc = useQueryClient();
  const [values, setValues] = useState<Record<string, string | number | boolean>>(initial ?? {});
  useEffect(() => { setValues(initial ?? {}); }, [instanceId, initial]);

  const save = useMutation({
    mutationFn: () => svc.updateEligibilityInputs(instanceId, values),
    onSuccess: () => {
      toast.success('Eligibility inputs saved');
      qc.invalidateQueries({ queryKey: annualReviewKeys.all });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (criteria.length === 0) return null;

  const setVal = (id: string, v: string | number | boolean) =>
    setValues((p) => ({ ...p, [id]: v }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Eligibility Inputs</span>
          <Button size="sm" onClick={() => save.mutate()} disabled={save.isPending} className="gap-1.5">
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Save
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="grid gap-3 md:grid-cols-2">
        {criteria.map((c) => {
          const raw = values[c.id];
          return (
            <div key={c.id} className="space-y-1 rounded-md border p-3">
              <Label className="text-xs">
                {c.name}
                <span className="ml-1 text-muted-foreground font-normal">
                  ({c.operator.replace('_', ' ')} {String(c.expected_value)})
                </span>
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
      </CardContent>
    </Card>
  );
}