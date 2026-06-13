import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { AlertCircle } from 'lucide-react';
import type { TemplateSystemScore, EligibilityCriterion } from '@/types/annualReview';
import { evaluateEligibility } from '@/lib/annualReview/eligibility';

export function SystemScoresPanel({
  systemScores,
  values,
  eligibility,
  eligibilityInputs,
  readOnly = false,
  onChangeValue,
}: {
  systemScores: TemplateSystemScore[];
  values: Record<string, number>;
  eligibility?: EligibilityCriterion[];
  eligibilityInputs?: Record<string, unknown>;
  readOnly?: boolean;
  onChangeValue?: (id: string, value: number) => void;
}) {
  const result = eligibility?.length ? evaluateEligibility(eligibility, eligibilityInputs ?? {}) : null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>System Scores</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {systemScores.length === 0 && (
          <p className="text-sm text-muted-foreground">No system scores configured for this template.</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {systemScores.map((s) => {
            const v = values[s.id] ?? 0;
            const pct = s.weight > 0 ? Math.min(100, (v / s.weight) * 100) : 0;
            return (
              <div key={s.id} className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">Max weight: {s.weight}</p>
                  </div>
                  {readOnly ? (
                    <p className="text-sm font-semibold tabular-nums">{Number(v).toFixed(2)}</p>
                  ) : (
                    <input
                      type="number"
                      step="0.01"
                      min={0}
                      max={s.weight}
                      value={v}
                      onChange={(e) => onChangeValue?.(s.id, Number(e.target.value))}
                      className="h-9 w-24 rounded border bg-background px-2 text-right text-sm tabular-nums"
                    />
                  )}
                </div>
                <Progress value={pct} className="h-2" />
              </div>
            );
          })}
        </div>

        {result && !result.passed && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Eligibility criteria not met</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {result.failures.map((f) => (
                  <li key={f.criterion.id}>
                    {f.criterion.name} — expected {f.criterion.operator.replace('_', ' ')} {String(f.criterion.expected_value)}; actual {String(f.actual ?? '—')}
                  </li>
                ))}
              </ul>
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}