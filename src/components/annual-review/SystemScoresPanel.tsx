import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { Progress } from '@/components/ui/progress';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { AlertCircle, ChevronDown, Calendar, Loader2, CheckCircle2, MinusCircle } from 'lucide-react';
import type { TemplateSystemScore, EligibilityCriterion, CarryKraConfig } from '@/types/annualReview';
import { evaluateEligibility } from '@/lib/annualReview/eligibility';
import { buildCarrySnapshot, selectMonths, FY_MONTHS } from '@/services/annualReview/carryKraScore';
import { KPI_SCALE_MAX, fyLabel } from '@/lib/annualReview/fiscalYear';
import { scoreFromRaw } from '@/lib/annualReview/systemKpiScoring';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import { formatExpected, formatActual } from '@/lib/annualReview/eligibilityFormat';

/**
 * Format a raw HR-entered achievement value for display based on the KPI
 * Library `uom_type`. Keeps display parity with the KPI Library units so
 * reviewers see what was measured (e.g. `90%`, `Yes`, `48 days`) rather
 * than the opaque scaled-points number.
 */
export function formatAchievement(
  raw: number | string | null | undefined,
  uomType?: string | null,
): string {
  if (raw === null || raw === undefined || raw === '') return '—';
  const n = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(n)) return String(raw);
  const fmt = (x: number) => {
    const r = Math.round(x * 100) / 100;
    return Number.isInteger(r) ? String(r) : r.toFixed(2);
  };
  const t = (uomType ?? '').toLowerCase();
  if (t === 'percent') {
    // Coerce fractional inputs (e.g. 0.9 → 90) to match bulk-upload coercion.
    const pct = Math.abs(n) > 0 && Math.abs(n) <= 1 ? n * 100 : n;
    return `${fmt(pct)}%`;
  }
  if (t === 'binary') return n >= 1 ? 'Yes' : 'No';
  if (t === 'days') return `${fmt(n)} ${n === 1 ? 'day' : 'days'}`;
  return fmt(n);
}

export function SystemScoresPanel({
  systemScores,
  values,
  rawValues,
  eligibility,
  eligibilityInputs,
  eligibilityRemark,
  readOnly = false,
  onChangeValue,
  onChangeRaw,
  employeeId,
  fiscalYear,
}: {
  systemScores: TemplateSystemScore[];
  values: Record<string, number>;
  /** Raw HR-entered values (bands mode). When set, band scoring drives `values`. */
  rawValues?: Record<string, number>;
  eligibility?: EligibilityCriterion[];
  eligibilityInputs?: Record<string, unknown>;
  eligibilityRemark?: string | null;
  readOnly?: boolean;
  onChangeValue?: (id: string, value: number) => void;
  /** Called when HR edits the raw value; caller must recompute scaled points. */
  onChangeRaw?: (id: string, raw: number, points: number) => void;
  /** Required for source=carry_kra fetches. */
  employeeId?: string;
  /** Fiscal year start (July of this year), required for source=carry_kra. */
  fiscalYear?: number;
}) {
  const result = eligibility?.length ? evaluateEligibility(eligibility, eligibilityInputs ?? {}) : null;
  const { t, tTemplate } = useAnnualReviewI18n();

  // Per-criterion status derivation (SSOT: evaluator failures). A criterion
  // is "pending" when the input is missing/empty, "fail" when it appears in
  // failures with a provided value, and "met" otherwise. This drives the
  // always-visible eligibility table (see POLICY §AR-ELIGIBILITY-ALWAYS-VISIBLE).
  const failureById = new Map(result?.failures.map((f) => [f.criterion.id, f]) ?? []);
  const inputs = eligibilityInputs ?? {};
  const hasValue = (c: EligibilityCriterion) => {
    const raw = (inputs as Record<string, unknown>)[c.id] ?? (inputs as Record<string, unknown>)[c.name];
    return raw !== undefined && raw !== null && raw !== '';
  };
  const anyPending = (eligibility ?? []).some((c) => !hasValue(c));
  const anyFailure = (result?.failures.length ?? 0) > 0;
  // Pending precedence over fail: a missing input is a "not yet filled" state,
  // not a policy breach — evaluator counts it as a failure, but users need to
  // see it as an actionable gap rather than a disqualification.
  const anyRealFailure = (result?.failures ?? []).some((f) => {
    const c = f.criterion;
    const raw = (inputs as Record<string, unknown>)[c.id] ?? (inputs as Record<string, unknown>)[c.name];
    return raw !== undefined && raw !== null && raw !== '';
  });
  void anyFailure;
  const overallStatus: 'met' | 'fail' | 'pending' = anyRealFailure ? 'fail' : anyPending ? 'pending' : 'met';

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
            const hasBands = !!s.scoring_rules?.bands?.length;
            const rawV = rawValues?.[s.id];
            const hasRaw = rawV !== undefined && rawV !== null;
            const ratingOutOf5 = hasBands && hasRaw
              ? scoreFromRaw(Number(rawV), s.scoring_rules!, s.weight).rating
              : null;
            return (
              <div key={s.id} className="space-y-2 rounded-lg border bg-card p-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">{tTemplate('system_score', s.id, 'name', s.name)}</p>
                    {s.description && (
                      <p className="mt-0.5 text-xs text-muted-foreground whitespace-pre-wrap">
                        {tTemplate('system_score', s.id, 'description', s.description)}
                      </p>
                    )}
                    {(hasRaw || hasBands) && (
                      <p className="mt-1 text-xs">
                        <span className="text-muted-foreground">
                          {t('system_scores.achievement_label', 'Achievement')}:
                        </span>{' '}
                        <span className="font-semibold tabular-nums">
                          {hasRaw ? formatAchievement(rawV as number, s.uom_type) : '—'}
                        </span>
                        {ratingOutOf5 !== null && (
                          <>
                            {' '}
                            <span className="text-muted-foreground">→</span>{' '}
                            <span className="font-medium">
                              {t('system_scores.rating_label', 'Rating')} {ratingOutOf5}/5
                            </span>
                          </>
                        )}
                      </p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      {t('system_scores.contribution', 'Contributes {actual} / {max} points to your appraisal')
                        .replace('{actual}', Number(v).toFixed(2))
                        .replace('{max}', String(s.weight))}
                    </p>
                    {hasBands && !hasRaw && (
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {t('system_scores.raw_hint', 'Enter the raw measurement — points are computed from the KPI Library bands.')}
                      </p>
                    )}
                  </div>
                  {readOnly ? (
                    <p className="text-sm font-semibold tabular-nums">{Number(v).toFixed(2)}</p>
                  ) : hasBands ? (
                    <input
                      type="number"
                      step="0.01"
                      value={rawV ?? ''}
                      placeholder={t('system_scores.raw_placeholder', 'raw')}
                      onChange={(e) => {
                        const raw = Number(e.target.value);
                        if (!Number.isFinite(raw)) return;
                        const result = scoreFromRaw(raw, s.scoring_rules!, s.weight);
                        if (onChangeRaw) onChangeRaw(s.id, raw, result.points);
                        else onChangeValue?.(s.id, result.points);
                      }}
                      className="h-9 w-24 rounded border bg-background px-2 text-right text-sm tabular-nums"
                    />
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

        {eligibility && eligibility.length > 0 && (
          <div
            data-testid="eligibility-section"
            data-status={overallStatus}
            className={
              overallStatus === 'fail'
                ? 'rounded-lg border border-destructive/40 bg-destructive/5 p-3'
                : overallStatus === 'met'
                ? 'rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3'
                : 'rounded-lg border bg-muted/30 p-3'
            }
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {overallStatus === 'fail' && <AlertCircle className="h-4 w-4 text-destructive" />}
                {overallStatus === 'met' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
                {overallStatus === 'pending' && <MinusCircle className="h-4 w-4 text-muted-foreground" />}
                <p
                  className={
                    overallStatus === 'fail'
                      ? 'text-sm font-semibold text-destructive'
                      : overallStatus === 'met'
                      ? 'text-sm font-semibold text-emerald-700 dark:text-emerald-400'
                      : 'text-sm font-semibold'
                  }
                >
                  {overallStatus === 'fail'
                    ? t('eligibility.title', 'Eligibility criteria not met')
                    : overallStatus === 'met'
                    ? t('eligibility.status.met', 'All eligibility criteria met')
                    : t('eligibility.status.pending', 'Eligibility inputs pending')}
                </p>
              </div>
              <Badge variant="outline" className="text-xs">
                {eligibility.length}{' '}
                {t('eligibility.count_label', eligibility.length === 1 ? 'criterion' : 'criteria')}
              </Badge>
            </div>
            <div className="mt-2 overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="h-8">{t('eligibility.col.criterion', 'Criterion')}</TableHead>
                    <TableHead className="h-8 text-right">{t('eligibility.col.expected', 'Expected')}</TableHead>
                    <TableHead className="h-8 text-right">{t('eligibility.col.actual', 'Actual')}</TableHead>
                    <TableHead className="h-8 text-center w-20">{t('eligibility.col.status', 'Status')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {eligibility.map((c) => {
                    const failure = failureById.get(c.id);
                    const provided = hasValue(c);
                    const rowStatus: 'met' | 'fail' | 'pending' = !provided
                      ? 'pending'
                      : failure
                      ? 'fail'
                      : 'met';
                    const actual = failure
                      ? failure.actual
                      : (inputs as Record<string, unknown>)[c.id] ??
                        (inputs as Record<string, unknown>)[c.name];
                    return (
                      <TableRow
                        key={c.id}
                        className={
                          rowStatus === 'fail'
                            ? 'bg-destructive/5 hover:bg-destructive/10'
                            : rowStatus === 'met'
                            ? 'bg-emerald-500/5 hover:bg-emerald-500/10'
                            : ''
                        }
                      >
                        <TableCell className="py-1.5 font-medium">
                          {tTemplate('eligibility', c.id, 'name', c.name)}
                        </TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums text-muted-foreground">
                          {formatExpected(c, t)}
                        </TableCell>
                        <TableCell className="py-1.5 text-right tabular-nums">
                          {actual == null || actual === '' ? (
                            <span className="text-muted-foreground">—</span>
                          ) : (
                            formatActual(actual, c.type, t)
                          )}
                        </TableCell>
                        <TableCell className="py-1.5 text-center">
                          {rowStatus === 'met' && (
                            <CheckCircle2 className="mx-auto h-4 w-4 text-emerald-600" aria-label="met" />
                          )}
                          {rowStatus === 'fail' && (
                            <AlertCircle className="mx-auto h-4 w-4 text-destructive" aria-label="not met" />
                          )}
                          {rowStatus === 'pending' && (
                            <MinusCircle className="mx-auto h-4 w-4 text-muted-foreground" aria-label="pending" />
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
            {eligibilityRemark && eligibilityRemark.trim() && (
              <div
                className={
                  overallStatus === 'fail'
                    ? 'mt-3 rounded-md border border-destructive/30 bg-destructive/5 p-3'
                    : 'mt-3 rounded-md border bg-muted/30 p-3'
                }
              >
                <p
                  className={
                    overallStatus === 'fail'
                      ? 'text-xs font-semibold text-destructive uppercase tracking-wide'
                      : 'text-xs font-semibold uppercase tracking-wide text-muted-foreground'
                  }
                >
                  {t('eligibility.remark_label', 'Remark from HR')}
                </p>
                <p className="mt-1 text-sm whitespace-pre-wrap">{eligibilityRemark}</p>
              </div>
            )}
          </div>
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
          {score.description && (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {tTemplate('system_score', score.id, 'description', score.description)}
            </p>
          )}
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
        <p className="text-xs text-muted-foreground">
          {t('carry.employee_context_missing', 'Employee context unavailable — cannot fetch carry score.')}
        </p>
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