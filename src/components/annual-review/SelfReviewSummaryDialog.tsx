import { useMemo } from 'react';
import { Loader2, AlertTriangle, FileText, CheckCircle2, Paperclip } from 'lucide-react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import type {
  AnnualReviewTemplate, EvidenceItem, TemplateCriterion,
} from '@/types/annualReview';
import type { CriteriaScoreSummary } from '@/lib/annualReview/scoring';

/**
 * Pre-submit summary dialog for the employee self-review.
 *
 * Renders a read-only snapshot of everything that will be persisted when the
 * user clicks `Confirm & Submit`. Required-but-empty qualitative fields are
 * highlighted and gate the confirm button so the employee can't accidentally
 * lock an incomplete review.
 *
 * All text resolution goes through the existing AnnualReviewI18n context so
 * the summary follows the active language and the per-template `display_mode`.
 */
interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  submitting?: boolean;
  template: AnnualReviewTemplate | undefined | null;
  draft: {
    criteria_scores?: Record<string, number | undefined>;
    qualitative_responses?: Record<string, string>;
    evidence?: EvidenceItem[];
  };
  summary: CriteriaScoreSummary;
  evidenceByCriterion: Record<string, EvidenceItem[]>;
}

export function SelfReviewSummaryDialog({
  open, onOpenChange, onConfirm, submitting,
  template, draft, summary, evidenceByCriterion,
}: Props) {
  const { t, tTemplate, tTemplateBilingual } = useAnnualReviewI18n();

  const criteria: TemplateCriterion[] = (template?.sections.criteria ?? [])
    .filter((c) => !c.reviewer_stages?.length || c.reviewer_stages.includes('self'));
  const fields = template?.sections.self_review_fields ?? [];
  const responses = draft.qualitative_responses ?? {};
  const scores = draft.criteria_scores ?? {};

  // Identify required qualitative fields that have no answer — these block submission.
  const missingRequired = useMemo(
    () => fields.filter((f) => f.required && !(responses[f.id] ?? '').trim()).map((f) => f.id),
    [fields, responses],
  );
  const hasBlockers = missingRequired.length > 0;

  const pct = summary.maxCriteriaScore > 0
    ? (summary.totalCriteriaScore / summary.maxCriteriaScore) * 100
    : 0;
  const evidenceCount = draft.evidence?.length ?? 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl w-[95vw] p-0 gap-0 max-h-[90vh] flex flex-col overflow-hidden">
        <DialogHeader className="p-6 pb-4 border-b bg-muted/30">
          <DialogTitle className="text-lg">
            {t('summary.title', 'Review your self-assessment before submitting')}
          </DialogTitle>
          <DialogDescription className="text-sm leading-relaxed">
            {t('confirm.submit.body',
              'Once submitted, your responses are locked and forwarded to your manager. You cannot edit them afterwards.')}
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="flex-1">
          <div className="px-6 py-5 space-y-6">
            {/* Score banner */}
            <div className="rounded-lg border bg-gradient-to-br from-primary/5 to-primary/10 p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                    {t('summary.total_score', 'Total Score')}
                  </div>
                  <div className="text-3xl font-bold mt-1 text-foreground">
                    {summary.totalCriteriaScore.toFixed(2)}
                    <span className="text-muted-foreground text-lg font-normal ml-1">
                      / {summary.maxCriteriaScore.toFixed(2)}
                    </span>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
                    {t('summary.weighted_achievement', 'Weighted achievement')}
                  </div>
                  <div className="text-3xl font-bold mt-1 text-primary">{pct.toFixed(1)}%</div>
                </div>
              </div>
              <Progress value={pct} className="h-2 mt-4" />
            </div>

            {/* Criteria */}
            {criteria.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {t('summary.criteria', 'Criteria')}
                  <Badge variant="secondary" className="font-normal">{criteria.length}</Badge>
                </h3>
                <div className="rounded-lg border divide-y overflow-hidden">
                  {/* Header row (desktop) */}
                  <div className="hidden sm:grid grid-cols-12 gap-2 px-3 py-2 bg-muted/40 text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                    <div className="col-span-5">{t('col.criterion', 'Criterion')}</div>
                    <div className="col-span-2">{t('col.weight', 'Weight')}</div>
                    <div className="col-span-2">{t('col.score', 'Score')}</div>
                    <div className="col-span-3">{t('col.total', 'Total')}</div>
                  </div>
                  {criteria.map((c) => {
                    const raw = scores[c.id];
                    const score = typeof raw === 'number' ? raw : null;
                    const opt = c.options?.find((o) => o.score === score);
                    const weight = Number(c.weight) || 0;
                    const contribution = score != null ? weight * score : 0;
                    const remark = (responses[c.id] ?? '').trim();
                    const notScored = score == null;
                    return (
                      <div
                        key={c.id}
                        className={`px-3 py-3 grid grid-cols-12 gap-2 text-sm items-center ${notScored ? 'bg-destructive/5' : ''}`}
                      >
                        <div className="col-span-12 sm:col-span-5">
                          <div className="font-medium">
                            {tTemplate('criterion', c.id, 'name', c.name)}
                          </div>
                          {opt && (
                            <div className="text-xs text-muted-foreground mt-0.5">
                              {tTemplateBilingual('option', opt.id, 'label', opt.label)}
                            </div>
                          )}
                        </div>
                        <div className="col-span-4 sm:col-span-2 text-muted-foreground">
                          <span className="sm:hidden text-xs">{t('col.weight', 'Weight')}: </span>{weight}%
                        </div>
                        <div className="col-span-4 sm:col-span-2">
                          <span className="sm:hidden text-xs text-muted-foreground">{t('col.score', 'Score')}: </span>
                          {notScored ? (
                            <Badge variant="outline" className="text-[10px] gap-1 border-destructive/40 text-destructive">
                              <AlertTriangle className="h-3 w-3" />
                              {t('summary.not_scored', 'Not scored')}
                            </Badge>
                          ) : (
                            <span className="font-medium">{score}</span>
                          )}
                        </div>
                        <div className="col-span-4 sm:col-span-3 font-semibold tabular-nums">
                          <span className="sm:hidden text-xs text-muted-foreground font-normal">{t('col.total', 'Total')}: </span>
                          {contribution.toFixed(2)}
                        </div>
                        {remark && (
                          <div className="col-span-12 text-xs text-muted-foreground italic border-l-2 border-muted pl-2 mt-1">
                            "{remark}"
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Qualitative Responses */}
            {fields.length > 0 && (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {t('section.qualitative', 'Qualitative Responses')}
                  <Badge variant="secondary" className="font-normal">{fields.length}</Badge>
                  {hasBlockers && (
                    <Badge variant="destructive" className="font-normal gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {missingRequired.length} {t('summary.missing', 'missing')}
                    </Badge>
                  )}
                </h3>
                <div className="space-y-3">
                  {fields.map((f) => {
                    const value = (responses[f.id] ?? '').trim();
                    const isMissing = !!f.required && !value;
                    return (
                      <div
                        key={f.id}
                        className={`rounded-lg border p-3 ${isMissing ? 'border-destructive/40 bg-destructive/5' : ''}`}
                      >
                        <div className="flex items-start justify-between gap-3 mb-1.5">
                          <div className="text-sm font-medium leading-snug">
                            {tTemplate('field', f.id, 'label', f.label)}
                            {f.required && <span className="text-destructive"> *</span>}
                          </div>
                          {isMissing && (
                            <Badge variant="destructive" className="text-[10px] gap-1 shrink-0">
                              <AlertTriangle className="h-3 w-3" />
                              {t('summary.required_empty', 'Required — empty')}
                            </Badge>
                          )}
                        </div>
                        <div className={`text-sm whitespace-pre-wrap leading-relaxed ${value ? 'text-foreground' : 'text-muted-foreground italic'}`}>
                          {value || t('summary.no_response', 'No response provided')}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* Evidence */}
            {evidenceCount > 0 ? (
              <section>
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2">
                  {t('summary.evidence', 'Evidence')}
                  <Badge variant="secondary" className="font-normal">{evidenceCount}</Badge>
                </h3>
                <div className="rounded-lg border divide-y text-sm overflow-hidden">
                  {criteria.map((c) => {
                    const files = evidenceByCriterion[c.id] ?? [];
                    if (files.length === 0) return null;
                    return (
                      <div key={c.id} className="p-3">
                        <div className="font-medium text-xs mb-1.5 text-muted-foreground uppercase tracking-wide">
                          {tTemplate('criterion', c.id, 'name', c.name)}
                        </div>
                        <ul className="space-y-1">
                          {files.map((e) => (
                            <li key={e.path} className="flex items-center gap-2 text-foreground">
                              <FileText className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                              <span className="truncate">{e.name}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : (
              <section className="rounded-lg border border-dashed p-4 flex items-center gap-2 text-sm text-muted-foreground">
                <Paperclip className="h-4 w-4" />
                {t('summary.no_evidence', 'No evidence files attached.')}
              </section>
            )}
          </div>
        </ScrollArea>

        <DialogFooter className="p-4 border-t bg-muted/30 gap-2 sm:gap-2 flex-row items-center flex-wrap">
          {hasBlockers ? (
            <div className="mr-auto text-xs text-destructive flex items-center gap-1.5 font-medium">
              <AlertTriangle className="h-3.5 w-3.5" />
              {t('summary.fix_required', 'Please answer all required fields before submitting.')}
            </div>
          ) : (
            <div className="mr-auto text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5 font-medium">
              <CheckCircle2 className="h-3.5 w-3.5" />
              {t('summary.ready', 'Ready to submit.')}
            </div>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            {t('btn.cancel', 'Cancel')}
          </Button>
          <Button onClick={onConfirm} disabled={!!submitting || hasBlockers}>
            {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {t('summary.confirm_submit', 'Confirm & Submit')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}