import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { Loader2, Upload, X } from 'lucide-react';
import { SCORE_COLOR, SCORE_LABEL } from '@/lib/annualReview/constants';
import type { TemplateCriterion, EvidenceItem } from '@/types/annualReview';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';
import { SpeakButton } from '@/components/annual-review/SpeakButton';
import { ReadAllButton } from '@/components/annual-review/ReadAllButton';

const COACHING_NOTES: Record<number, string> = {
  5: 'Reserve "Outstanding" for documented, repeated excellence — avoid leniency bias.',
  4: 'Above-target performance with clear evidence. Watch for halo bias.',
  3: 'Solid expected performance — the default for someone meeting their role.',
  2: 'Highlight a specific gap; avoid central-tendency bias by being concrete.',
  1: 'Document the issue and the support discussed.',
  0: 'Use only when the deliverable was not achieved at all.',
};

export interface CriteriaScoringMatrixProps {
  criteria: TemplateCriterion[];
  values: Record<string, number | undefined>;
  remarks: Record<string, string>;
  evidence?: Record<string, EvidenceItem[]>;
  readOnly?: boolean;
  reviewerLabel?: string;
  onChangeScore?: (criterionId: string, score: number) => void;
  onChangeRemark?: (criterionId: string, text: string) => void;
  onUploadEvidence?: (criterionId: string, file: File) => Promise<EvidenceItem | void>;
  onRemoveEvidence?: (criterionId: string, path: string) => void;
  comparison?: {
    label: string;
    /** Reviewer role, used to identify the "Self" entry for variance detection. */
    role?: 'self' | 'manager' | 'skip_manager' | 'dept_head' | 'bu_head' | 'hr';
    values: Record<string, number | undefined>;
    remarks?: Record<string, string>;
  }[];
  /** Show reviewer coaching note under the selected score. Never enable for self-review. */
  showCoachingNote?: boolean;
}

export function CriteriaScoringMatrix(props: CriteriaScoringMatrixProps) {
  return (
    <TooltipProvider>
      <div className="space-y-4">
        {props.criteria.map((c) => (
          <CriterionRow key={c.id} criterion={c} {...props} />
        ))}
      </div>
    </TooltipProvider>
  );
}

function CriterionRow({
  criterion,
  values,
  remarks,
  evidence,
  readOnly,
  reviewerLabel,
  comparison,
  showCoachingNote,
  onChangeScore,
  onChangeRemark,
  onUploadEvidence,
  onRemoveEvidence,
}: CriteriaScoringMatrixProps & { criterion: TemplateCriterion }) {
  const [uploading, setUploading] = useState(false);
  const { t, tTemplate, tTemplateOptionBilingual } = useAnnualReviewI18n();
  const criterionName = tTemplate('criterion', criterion.id, 'name', criterion.name);
  const criterionDesc = criterion.description
    ? tTemplate('criterion', criterion.id, 'description', criterion.description)
    : '';
  const score = values[criterion.id];
  const w = Number(criterion.weight) || 0;
  const total = typeof score === 'number' ? w * score : null;
  const enableRemarks = criterion.enable_remarks !== false;
  const enableEvidence = !!criterion.enable_evidence;
  const hasOptions = Array.isArray(criterion.options) && criterion.options.length > 0;
  const optionLabel = (opt: NonNullable<TemplateCriterion['options']>[number]) => {
    const translated = opt.label_hi?.trim();
    const fallback = opt.label;
    const fromTranslations = tTemplateOptionBilingual(criterion.id, opt.id, 'label', fallback);
    if (fromTranslations !== fallback) return fromTranslations;
    if (currentLanguage !== defaultLanguage && translated) return `${fallback} / ${translated}`;
    return fallback;
  };
  const optionLabels = hasOptions
    ? criterion.options!.map(optionLabel)
    : [];
  const readAllTexts = [criterionName, criterionDesc, ...optionLabels];

  return (
    <Card>
      <CardContent className="p-4 md:p-6 space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-start gap-2">
              <h4 className="font-semibold text-base">{criterionName}</h4>
              <SpeakButton text={criterionName} className="mt-0.5" />
              <ReadAllButton texts={readAllTexts} className="ml-1" />
            </div>
            {criterion.description && (
              <div className="mt-0.5 flex items-start gap-2">
                <p className="text-sm text-muted-foreground">{criterionDesc}</p>
                <SpeakButton text={criterionDesc} className="mt-0.5" />
              </div>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm font-mono">
            <div className="rounded-md border border-emerald-500/30 bg-emerald-500/5 px-3 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">{t('col.weight', 'Weight')}</div>
              <div className="font-semibold text-emerald-400">{w}</div>
            </div>
            <span className="text-muted-foreground">×</span>
            <div className="rounded-md border border-blue-500/30 bg-blue-500/5 px-3 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">{t('col.score', 'Score')}</div>
              <div className="font-semibold text-blue-400">{typeof score === 'number' ? score : '–'}</div>
            </div>
            <span className="text-muted-foreground">=</span>
            <div className="rounded-md border border-indigo-500/30 bg-indigo-500/5 px-3 py-1.5">
              <div className="text-[10px] uppercase text-muted-foreground">{t('col.total', 'Total')}</div>
              <div className="font-semibold text-indigo-400">{total !== null ? total.toFixed(2) : '–'}</div>
            </div>
          </div>
        </div>

        <div className="space-y-3">
          <div className="text-sm font-semibold text-foreground">
            {t('criteria.your_score', 'Your Score')}
          </div>
          {hasOptions ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {criterion.options!.map((opt) => {
                const active = score === opt.score;
                const c = SCORE_COLOR[opt.score] ?? SCORE_COLOR[0];
                const label = optionLabel(opt);
                return (
                  <div key={opt.id} className="relative">
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChangeScore?.(criterion.id, opt.score)}
                    aria-pressed={active}
                    aria-label={`${label} — Score ${opt.score}`}
                    className={[
                      'group w-full text-left rounded-lg border p-3 min-h-[88px] transition-all',
                      'flex items-start gap-3',
                      active
                        ? `border-amber-500 bg-amber-500/5 ring-2 ring-amber-500/40 ${c.text}`
                        : 'border-border bg-card hover:bg-muted/40 hover:border-muted-foreground/40',
                      readOnly ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer',
                    ].join(' ')}
                  >
                    <span
                      className={[
                        'mt-0.5 inline-flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                        active ? 'border-amber-500' : 'border-muted-foreground/40 group-hover:border-muted-foreground',
                      ].join(' ')}
                      aria-hidden="true"
                    >
                      {active && <span className="h-2 w-2 rounded-full bg-amber-500" />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className={['block text-sm leading-snug pr-8', active ? 'font-semibold' : 'font-medium text-foreground'].join(' ')}>
                        {label}
                      </span>
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {t('col.score', 'Score')}: {opt.score}
                      </span>
                    </span>
                  </button>
                  <div className="absolute top-2 right-2">
                    <SpeakButton text={label} />
                  </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              {[0, 1, 2, 3, 4, 5].map((n) => {
            const c = SCORE_COLOR[n];
            const active = score === n;
            return (
              <Tooltip key={n}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    disabled={readOnly}
                    onClick={() => onChangeScore?.(criterion.id, n)}
                    aria-label={`Score ${n} — ${SCORE_LABEL[n]}`}
                    aria-pressed={active}
                    className={[
                      'h-10 w-10 rounded-full border-2 font-semibold text-sm transition-all',
                      c.border,
                      active
                        ? `${c.bg} ${c.text} scale-110 ring-2 ring-offset-2 ring-offset-background ${c.ring}`
                        : `${c.text} hover:${c.bg} hover:scale-105`,
                      readOnly ? 'opacity-50 cursor-not-allowed hover:scale-100' : '',
                    ].join(' ')}
                  >
                    {n}
                  </button>
                </TooltipTrigger>
                <TooltipContent side="bottom">
                  <div className="text-xs">
                    <div className="font-semibold">{n} — {SCORE_LABEL[n]}</div>
                    {reviewerLabel && <div className="text-muted-foreground">{reviewerLabel} perspective</div>}
                  </div>
                </TooltipContent>
              </Tooltip>
            );
              })}
            </div>
          )}
          {typeof score === 'number' && showCoachingNote && reviewerLabel !== 'Self' && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-1.5 text-xs text-amber-400 max-w-md">
              <span className="font-semibold">Coaching note:</span> {COACHING_NOTES[score]}
            </div>
          )}
        </div>

        {comparison && comparison.length > 0 && (
          <div className="space-y-2 border-t border-border/50 pt-3">
            <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
              {comparison.map((c) => {
                const v = c.values[criterion.id];
                return (
                  <span key={c.label} className="rounded-md border px-2 py-1">
                    {c.label}: <span className="font-semibold text-foreground">{typeof v === 'number' ? v : '–'}</span>
                  </span>
                );
              })}
            </div>
            {(() => {
              const selfEntry = comparison.find((c) => c.role === 'self');
              const selfRemark = selfEntry?.remarks?.[criterion.id];
              if (!selfRemark) return null;
              return (
                <div className="rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-xs">
                  <div className="font-semibold text-muted-foreground mb-0.5">
                    {t('comparison.employee_remark', "Employee's remark")}
                  </div>
                  <div className="whitespace-pre-wrap text-foreground/90">{selfRemark}</div>
                </div>
              );
            })()}
          </div>
        )}

        {(() => {
          // Justification prompt when reviewer score differs from the employee's self score.
          // Per POLICY §AR-VARIANCE-JUSTIFICATION the field is not mandatory, but we do NOT
          // label it "optional" in the UI — that discourages submissions.
          if (!reviewerLabel || reviewerLabel === 'Self' || reviewerLabel === 'self') return null;
          const selfEntry = comparison?.find((c) => c.role === 'self');
          if (!selfEntry) return null;
          const selfScore = selfEntry.values[criterion.id];
          if (typeof selfScore !== 'number' || typeof score !== 'number') return null;
          if (selfScore === score) return null;
          const varianceKey = `${criterion.id}__variance`;
          return (
            <div className="border-t border-border/50 pt-3 space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">
                {t(
                  'variance.justification_label',
                  'Justification for score difference',
                )}
              </div>
              <Textarea
                aria-label="Justification for score difference"
                placeholder={t(
                  'variance.justification_placeholder',
                  `Why does your rating (${score}) differ from the employee's (${selfScore})?`,
                )}
                value={remarks[varianceKey] ?? ''}
                onChange={(e) => onChangeRemark?.(varianceKey, e.target.value)}
                disabled={readOnly}
                rows={2}
              />
            </div>
          );
        })()}

        {(enableRemarks || enableEvidence) && (
          <div className="grid gap-3 md:grid-cols-2 border-t border-border/50 pt-4">
            {enableRemarks && (
              <Textarea
                placeholder={t('col.remarks_placeholder', 'Remarks / justification')}
                value={remarks[criterion.id] ?? ''}
                onChange={(e) => onChangeRemark?.(criterion.id, e.target.value)}
                disabled={readOnly}
                rows={3}
              />
            )}
            {enableEvidence && (
              <div className="space-y-2">
                {!readOnly && (
                  <label className="inline-flex items-center gap-2 h-10 px-3 rounded-md border bg-background hover:bg-muted/50 cursor-pointer text-sm">
                    {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                    <span>{t('evidence.upload', 'Upload evidence')}</span>
                    <input
                      type="file"
                      multiple
                      hidden
                      onChange={async (e) => {
                        const files = Array.from(e.target.files ?? []);
                        e.currentTarget.value = '';
                        if (!files.length || !onUploadEvidence) return;
                        setUploading(true);
                        try { for (const f of files) await onUploadEvidence(criterion.id, f); }
                        finally { setUploading(false); }
                      }}
                    />
                  </label>
                )}
                <ul className="space-y-1">
                  {(evidence?.[criterion.id] ?? []).map((e) => (
                    <li key={e.path} className="flex items-center justify-between rounded border bg-muted/40 px-2 py-1 text-xs">
                      <span className="truncate">{e.name}</span>
                      {!readOnly && onRemoveEvidence && (
                        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onRemoveEvidence(criterion.id, e.path)}>
                          <X className="h-3 w-3" />
                        </Button>
                      )}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}