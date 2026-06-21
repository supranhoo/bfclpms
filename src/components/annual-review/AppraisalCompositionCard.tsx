import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ScoreComposition } from '@/lib/annualReview/scoringComposition';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';

/**
 * Surface the System + Criteria → Overall score breakdown.
 *
 * Two variants:
 *   - `full`   — 3-column card (used at the top of the form and inside the
 *                pre-submit dialog).
 *   - `inline` — single-line summary (used in the sticky footer).
 *
 * The card never edits state — purely presentational. Math comes from the
 * `computeScoreComposition` SSOT.
 */
export function AppraisalCompositionCard({
  composition,
  variant = 'full',
}: {
  composition: ScoreComposition;
  variant?: 'full' | 'inline';
}) {
  const { t } = useAnnualReviewI18n();
  const { systemActual, systemMax, criteriaActual, criteriaMax, overallActual, overallMax } = composition;
  const overallPct = overallMax > 0 ? (overallActual / overallMax) * 100 : 0;

  if (variant === 'inline') {
    return (
      <div className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1 tabular-nums">
        <span className="font-semibold text-foreground">
          {t('comp.overall', 'Overall')} {overallActual.toFixed(2)} / {overallMax}
        </span>
        {systemMax > 0 && (
          <span className="text-muted-foreground">
            · {t('comp.system', 'System')} {systemActual.toFixed(2)} / {systemMax}
          </span>
        )}
        {criteriaMax > 0 && (
          <span className="text-muted-foreground">
            · {t('comp.criteria', 'Criteria')} {criteriaActual.toFixed(2)} / {criteriaMax}
          </span>
        )}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="p-4 space-y-3">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Column
            label={t('comp.system', 'System Score')}
            hint={t('comp.system_hint', 'Auto-fetched (e.g. KRA)')}
            actual={systemActual}
            max={systemMax}
            emptyText={t('comp.no_system', 'No system score configured')}
          />
          <Column
            label={t('comp.criteria', 'Criteria Score')}
            hint={t('comp.criteria_hint', 'Rated against criteria')}
            actual={criteriaActual}
            max={criteriaMax}
            emptyText={t('comp.no_criteria', 'Auto-scored — no criteria to rate')}
          />
          <Column
            label={t('comp.overall', 'Overall')}
            hint={t('comp.overall_hint', 'System + Criteria, capped at 100')}
            actual={overallActual}
            max={overallMax}
            emphasize
          />
        </div>
        <div>
          <Progress value={overallPct} className="h-2" />
          <div className="text-[11px] text-muted-foreground mt-1 text-right tabular-nums">
            {overallPct.toFixed(1)}%
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function Column({
  label, hint, actual, max, emphasize, emptyText,
}: {
  label: string;
  hint: string;
  actual: number;
  max: number;
  emphasize?: boolean;
  emptyText?: string;
}) {
  const pct = max > 0 ? Math.min(100, (actual / max) * 100) : 0;
  return (
    <div className="rounded-md border bg-card/40 p-3 space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">{label}</span>
      </div>
      {max <= 0 ? (
        <div className="text-xs text-muted-foreground italic min-h-[2.25rem]">{emptyText ?? '—'}</div>
      ) : (
        <>
          <div className={`tabular-nums ${emphasize ? 'text-2xl font-bold text-primary' : 'text-xl font-semibold'}`}>
            {actual.toFixed(2)}
            <span className="text-muted-foreground text-sm font-normal ml-1">/ {max}</span>
          </div>
          <Progress value={pct} className="h-1.5" />
        </>
      )}
      <div className="text-[10px] text-muted-foreground leading-tight">{hint}</div>
    </div>
  );
}