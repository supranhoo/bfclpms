import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ChevronDown, Calendar, Loader2 } from 'lucide-react';
import type { TemplateSystemScore, EligibilityCriterion, CarryKraConfig } from '@/types/annualReview';
import { evaluateEligibility } from '@/lib/annualReview/eligibility';
import { buildCarrySnapshot, selectMonths, FY_MONTHS } from '@/services/annualReview/carryKraScore';
import { KPI_SCALE_MAX, fyLabel } from '@/lib/annualReview/fiscalYear';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';

export function SystemScoresPanel({
  systemScores,
  values,
  eligibility,
  eligibilityInputs,
  readOnly = false,
  onChangeValue,
  employeeId,
  fiscalYear,
}: {
  systemScores: TemplateSystemScore[];
  values: Record<string, number>;
  eligibility?: EligibilityCriterion[];
  eligibilityInputs?: Record<string, unknown>;
  readOnly?: boolean;
  onChangeValue?: (id: string, value: number) => void;
  /** Required for source=carry_kra fetches. */
  employeeId?: string;
  /** Fiscal year start (July of this year), required for source=carry_kra. */
  fiscalYear?: number;
}) {
  const result = eligibility?.length ? evaluateEligibility(eligibility, eligibilityInputs ?? {}) : null;
  const { t, tTemplate } = useAnnualReviewI18n();

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('section.system_scores', 'System Scores')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {systemScores.length === 0 && (
          <p className="text-sm text-muted-foreground">{t('system_scores.empty', 'No system scores configured for this template.')}</p>
        )}
        <div className="grid gap-4 md:grid-cols-2">
          {systemScores.map((s) => {
            if (s.source === 'carry_kra') {
              return (
                <CarryKraScoreCard
                  key={s.id}
                  score={s}
                  storedValue={values[s.id]}
                  employeeId={employeeId}
                  fiscalYear={fiscalYear}
                  onChangeValue={onChangeValue}
                />
              );
            }
            const v = values[s.id] ?? 0;
            const pct = s.weight > 0 ? Math.min(100, (v / s.weight) * 100) : 0;
            return (
              <div key={s.id} className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{tTemplate('system_score', s.id, 'name', s.name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {t('system_scores.contribution', 'Contributes {actual} / {max} points to your appraisal')
                        .replace('{actual}', Number(v).toFixed(2))
                        .replace('{max}', String(s.weight))}
                    </p>
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
            <AlertTitle>{t('eligibility.title', 'Eligibility criteria not met')}</AlertTitle>
            <AlertDescription>
              <ul className="list-disc pl-5 mt-1 space-y-0.5">
                {result.failures.map((f) => (
                  <li key={f.criterion.id}>
                    {tTemplate('eligibility', f.criterion.id, 'name', f.criterion.name)} — expected {f.criterion.operator.replace('_', ' ')} {String(f.criterion.expected_value)}; actual {String(f.actual ?? '—')}
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

/** Renders a Carry KRA score card with the auto-fetched monthly breakdown. */
function CarryKraScoreCard({
  score, storedValue, employeeId, fiscalYear, onChangeValue,
}: {
  score: TemplateSystemScore;
  storedValue: number | undefined;
  employeeId?: string;
  fiscalYear?: number;
  onChangeValue?: (id: string, value: number) => void;
}) {
  const { t, tTemplate } = useAnnualReviewI18n();
  const cfg: CarryKraConfig = score.carry_config ?? { aggregation: 'overall_avg', excludeNa: true };
  const enabled = !!employeeId && typeof fiscalYear === 'number';

  const { data, isLoading, error } = useQuery({
    queryKey: ['carryKraScore', employeeId, fiscalYear, cfg, score.weight],
    queryFn: () => buildCarrySnapshot(employeeId!, fiscalYear!, cfg, Number(score.weight) || 0),
    enabled,
    staleTime: 60_000,
  });

  // Idempotent sync of the computed (scaled) value into instance.system_scores.
  // Side-effects MUST live in useEffect (project core rule).
  useEffect(() => {
    if (!data || !onChangeValue) return;
    if (Number(storedValue ?? -1) === data.value) return;
    onChangeValue(score.id, data.value);
  }, [data, onChangeValue, score.id, storedValue]);

  const value = data?.value ?? storedValue ?? 0;
  const maxValue = data?.maxValue ?? (Number(score.weight) || 0);
  const rating = data?.rating ?? 0;
  const pct = maxValue > 0 ? Math.min(100, (Number(value) / maxValue) * 100) : 0;
  const selected = data ? selectMonths(data.monthly, cfg) : [];
  const selectedSet = new Set(selected.map((m) => m.month));

  return (
    <div className="space-y-2 rounded-lg border bg-card p-3 md:col-span-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="space-y-0.5">
          <p className="text-sm font-medium flex items-center gap-2">
            {tTemplate('system_score', score.id, 'name', score.name)}
            <Badge variant="secondary" className="text-[10px] gap-1"><Calendar className="h-3 w-3" />Carry KRA</Badge>
          </p>
          <p className="text-xs text-muted-foreground">
            {typeof fiscalYear === 'number' ? fyLabel(fiscalYear) : 'FY —'} · {labelForCfg(cfg)}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <>
              <Metric label={t('carry.achieved', 'Achieved')} value={Number(value).toFixed(2)} emphasize />
              <Metric label={t('carry.out_of', 'Out of')} value={Number(maxValue).toFixed(0)} />
              <Metric
                label={t('carry.rating', 'Rating')}
                value={`${Number(rating).toFixed(2)} / ${KPI_SCALE_MAX}`}
              />
            </>
          )}
        </div>
      </div>
      <Progress value={pct} className="h-2" />

      {!enabled && (
        <p className="text-xs text-muted-foreground">Employee context unavailable — cannot fetch carry score.</p>
      )}
      {error && (
        <Alert variant="destructive" className="py-2">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription className="text-xs">{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {data && (
        <Collapsible>
          <CollapsibleTrigger className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline">
            <ChevronDown className="h-3.5 w-3.5" /> {t('section.monthly_kra_breakdown', 'Monthly KRA breakdown')} ({data.monthly.filter((m) => m.avg != null).length} / 12)
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-2">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="h-8">{t('col.month', 'Month')}</TableHead>
                  <TableHead className="h-8 text-right">{t('col.kpis', 'KPIs')}</TableHead>
                  <TableHead className="h-8 text-right">{t('col.total_score', 'Total Score')}</TableHead>
                  <TableHead className="h-8 text-right">{t('col.out_of', 'Out Of')}</TableHead>
                  <TableHead className="h-8 text-right">{t('col.percent', '%')}</TableHead>
                  <TableHead className="h-8 text-right">{t('col.rating_5', `Rating (/${KPI_SCALE_MAX})`)}</TableHead>
                  <TableHead className="h-8 w-20">{t('col.used', 'Used')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.monthly.map((m) => (
                  <TableRow key={m.month} className={!selectedSet.has(m.month) ? 'opacity-50' : ''}>
                    <TableCell className="py-1.5">{m.month}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">{m.kpiCount}</TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {m.totalScore == null ? <span className="text-muted-foreground">—</span> : m.totalScore.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {m.outOf == null ? <span className="text-muted-foreground">—</span> : m.outOf.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {m.percentage == null ? <span className="text-muted-foreground">—</span> : `${m.percentage.toFixed(2)}%`}
                    </TableCell>
                    <TableCell className="py-1.5 text-right tabular-nums">
                      {m.avg == null ? <span className="text-muted-foreground">—</span> : m.avg.toFixed(2)}
                    </TableCell>
                    <TableCell className="py-1.5">
                      {selectedSet.has(m.month) && m.avg != null ? '✓' : ''}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CollapsibleContent>
        </Collapsible>
      )}
    </div>
  );
}

function labelForCfg(cfg: CarryKraConfig): string {
  if (cfg.aggregation === 'last_n_months') return `last ${cfg.lastN ?? 6} months`;
  if (cfg.aggregation === 'selected_months') return `${(cfg.months ?? []).length} selected months`;
  return 'overall average';
}

function Metric({ label, value, emphasize }: { label: string; value: string; emphasize?: boolean }) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</span>
      <span className={`tabular-nums ${emphasize ? 'text-sm font-semibold' : 'text-xs font-medium'}`}>{value}</span>
    </span>
  );
}