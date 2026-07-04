import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import {
  useActiveCycle,
  useMyInstance,
  useTemplate,
  useInstanceResponses,
  useAdvanceStatus,
  useUploadEvidence,
  useDebouncedResponseDraft,
} from '@/hooks/useAnnualReview';
import { AnnualReviewStageTracker } from '@/components/annual-review/AnnualReviewStageTracker';
import { useShowReviewerNamesInStepper } from '@/hooks/useAnnualReviewSettings';
import { useActiveProfilesLite } from '@/hooks/useSafetyOrg';
import { buildReviewerNamesByStage } from '@/lib/annualReview/reviewerNames';
import { computeVisibleStages, computeStageResolutions } from '@/lib/annualReview/visibleStages';
import { AnnualReviewStatusBadge } from '@/components/annual-review/AnnualReviewStatusBadge';
import { CriteriaScoringMatrix } from '@/components/annual-review/CriteriaScoringMatrix';
import { shouldHideCriteriaCard, criteriaForStage } from '@/lib/annualReview/templateVisibility';
import { SystemScoresPanel } from '@/components/annual-review/SystemScoresPanel';
import { LanguageSwitcher } from '@/components/annual-review/LanguageSwitcher';
import { useAnnualReviewTranslation } from '@/hooks/useAnnualReviewTranslation';
import { AnnualReviewI18nProvider } from '@/components/annual-review/AnnualReviewI18nContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { SelfReviewSummaryDialog } from '@/components/annual-review/SelfReviewSummaryDialog';
import { toast } from 'sonner';
import { computeCriteriaScore } from '@/lib/annualReview/scoring';
import { computeScoreComposition } from '@/lib/annualReview/scoringComposition';
import * as arSvc from '@/services/annualReview/annualReviewService';
import { AppraisalCompositionCard } from '@/components/annual-review/AppraisalCompositionCard';
import { fyStartFromCycle } from '@/lib/annualReview/fiscalYear';
import { useResolvedSystemScores } from '@/hooks/useResolvedSystemScores';
import type { EvidenceItem } from '@/types/annualReview';
import { EmployeeResultsView } from '@/components/annual-review/EmployeeResultsView';
import { SelfReviewFieldsCard } from '@/components/annual-review/SelfReviewFieldsCard';

export default function EmployeeAnnualReview() {
  const { user, profile } = useAuth();
  const { data: cycle, isLoading: cycleLoading } = useActiveCycle();
  const { data: instance, isLoading: instLoading } = useMyInstance(user?.id, cycle?.id);
  const { data: template } = useTemplate(
    (instance as { template_override_id?: string | null } | null)?.template_override_id ?? instance?.template_id,
  );
  const { data: responses = [] } = useInstanceResponses(instance?.id);
  const advance = useAdvanceStatus();
  const upload = useUploadEvidence();

  const { data: showReviewerNames = false } = useShowReviewerNamesInStepper();
  const { data: profiles } = useActiveProfilesLite();
  const reviewerNamesByStage = useMemo(
    () => (showReviewerNames && instance ? buildReviewerNamesByStage(instance, profiles) : undefined),
    [showReviewerNames, instance, profiles],
  );
  const visibleStages = useMemo(
    () => (instance ? computeVisibleStages(instance, profiles) ?? instance.enabled_stages : undefined),
    [instance, profiles],
  );
  const skippedStages = useMemo(() => {
    if (!instance) return undefined;
    const rows = computeStageResolutions(instance, profiles);
    if (!rows) return undefined;
    return rows
      .filter((r) => r.skipped && r.skipReason)
      .map((r) => ({ stage: r.stage, reason: r.skipReason! }));
  }, [instance, profiles]);

  const myResponse = responses.find((r) => r.reviewer_role === 'self') ?? null;
  const locked = myResponse?.is_locked || (instance && instance.overall_status !== 'pending_self');

  const [lang, setLang] = useState<string>(instance?.language_pref ?? 'en');
  useEffect(() => { if (instance?.language_pref) setLang(instance.language_pref); }, [instance?.language_pref]);

  const { t } = useAnnualReviewTranslation({
    currentLanguage: lang,
    defaultLanguage: template?.sections.settings?.default_language ?? 'en',
    templateTranslations: template?.sections.translations,
  });

  const { draft, setDraft, flush, status: saveStatus } = useDebouncedResponseDraft({
    instanceId: instance?.id ?? '',
    reviewerId: user?.id ?? '',
    role: 'self',
    initial: myResponse,
    enabled: !!instance && !locked,
  });

  const [confirmOpen, setConfirmOpen] = useState(false);

  const summary = useMemo(
    () => computeCriteriaScore(template?.sections.criteria ?? [], draft.criteria_scores ?? {}),
    [template, draft.criteria_scores],
  );

  const { values: resolvedSystemScores } = useResolvedSystemScores(
    template,
    instance,
    cycle ? fyStartFromCycle(cycle) : undefined,
  );

  const composition = useMemo(
    () => computeScoreComposition(template, resolvedSystemScores, draft.criteria_scores ?? {}),
    [template, resolvedSystemScores, draft.criteria_scores],
  );

  const evidenceByCriterion = useMemo(() => {
    const map: Record<string, EvidenceItem[]> = {};
    for (const e of draft.evidence ?? []) {
      const [cid, ...rest] = e.name.split('::');
      const realName = rest.length ? rest.join('::') : e.name;
      (map[cid] ||= []).push({ ...e, name: realName });
    }
    return map;
  }, [draft.evidence]);

  if (cycleLoading || instLoading) {
    return <div className="p-6 flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</div>;
  }
  if (!cycle) {
    return <div className="p-6"><Card><CardContent className="p-6">There is no active annual review cycle.</CardContent></Card></div>;
  }
  if (!instance) {
    return <div className="p-6"><Card><CardContent className="p-6">No annual review instance has been assigned to you for the {cycle.name} cycle.</CardContent></Card></div>;
  }

  // Finalized: show the read-only results & acknowledgment view.
  if (instance.overall_status === 'completed') {
    return (
      <AnnualReviewI18nProvider
        currentLanguage={lang}
        defaultLanguage={template?.sections.settings?.default_language ?? 'en'}
        templateTranslations={template?.sections.translations}
        displayMode={template?.sections.display_mode}
        enableAudio={template?.sections.settings?.enable_audio === true}
      >
        <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
          <header className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">{cycle.name}</h1>
              <p className="text-sm text-muted-foreground">{t('cycle.my_review_by', 'My annual review')} · {profile?.full_name}</p>
            </div>
            <AnnualReviewStatusBadge status={instance.overall_status} />
          </header>
          <AnnualReviewStageTracker status={instance.overall_status} enabledStages={visibleStages} reviewerNamesByStage={reviewerNamesByStage} skippedStages={skippedStages} />
          <EmployeeResultsView instance={instance} template={template} responses={responses} />
        </div>
      </AnnualReviewI18nProvider>
    );
  }

  const handleSubmit = async () => {
    setConfirmOpen(false);
    try {
      await flush();
      // Persist the reviewer's weighted criteria score so the admin Progress
      // grid and downstream final-score math have a value to read. Without
      // this, `weighted_score` stays NULL and the SELF/MGR/etc. columns show
      // "—" even after submit.
      if (user && instance) {
        const criteria = template?.sections.criteria ?? [];
        const ws = computeCriteriaScore(criteria, draft.criteria_scores ?? {}).totalCriteriaScore;
        await arSvc.upsertResponseDraft({
          instance_id: instance.id,
          reviewer_id: user.id,
          reviewer_role: 'self',
          weighted_score: ws,
        });
      }
      await advance.mutateAsync({ instanceId: instance.id, role: 'self' });
      toast.success(t('note.locked', 'Your review has been submitted and forwarded.'));
    } catch (e) { toast.error((e as Error).message); }
  };

  const onUpload = async (criterionId: string, file: File): Promise<EvidenceItem | void> => {
    if (!user) return;
    const ev = await upload.mutateAsync({ instanceId: instance.id, reviewerId: user.id, role: 'self', file });
    const tagged: EvidenceItem = { ...ev, name: `${criterionId}::${ev.name}` };
    setDraft((p) => ({ ...p, evidence: [...(p.evidence ?? []), tagged] }));
    return tagged;
  };

  const availLangs = template?.sections.settings?.enable_multilingual
    ? template.sections.settings.available_languages ?? ['en']
    : ['en'];

  return (
    <AnnualReviewI18nProvider
      currentLanguage={lang}
      defaultLanguage={template?.sections.settings?.default_language ?? 'en'}
      templateTranslations={template?.sections.translations}
      displayMode={template?.sections.display_mode}
      enableAudio={template?.sections.settings?.enable_audio === true}
    >
    <div className="p-4 md:p-6 space-y-6 max-w-5xl mx-auto">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">{cycle.name}</h1>
          <p className="text-sm text-muted-foreground">{t('cycle.my_review_by', 'My annual review')} · {profile?.full_name}</p>
        </div>
        <div className="flex items-center gap-3">
          {availLangs.length > 1 && <LanguageSwitcher value={lang} onChange={setLang} available={availLangs} />}
          <AnnualReviewStatusBadge status={instance.overall_status} />
        </div>
      </header>

      <AnnualReviewStageTracker status={instance.overall_status} enabledStages={visibleStages} reviewerNamesByStage={reviewerNamesByStage} skippedStages={skippedStages} />

      <AppraisalCompositionCard composition={composition} variant="full" />

      <SystemScoresPanel
        systemScores={template?.sections.system_scores ?? []}
        values={instance.system_scores ?? {}}
        eligibility={template?.sections.eligibility_criteria}
        eligibilityInputs={instance.eligibility_inputs}
        eligibilityRemark={instance.eligibility_remark}
        employeeId={instance.employee_id}
        fiscalYear={fyStartFromCycle(cycle)}
        readOnly
      />

      {!shouldHideCriteriaCard(template, 'self') && (
        <Card>
          <CardHeader><CardTitle>{t('section.self_assessment', 'Self-Assessment Criteria')}</CardTitle></CardHeader>
          <CardContent>
            <CriteriaScoringMatrix
              criteria={criteriaForStage(template, 'self')}
              values={draft.criteria_scores ?? {}}
              remarks={(draft.qualitative_responses ?? {}) as Record<string, string>}
              evidence={evidenceByCriterion}
              readOnly={!!locked}
              reviewerLabel="Self"
              onChangeScore={(id, v) => setDraft((p) => ({ ...p, criteria_scores: { ...(p.criteria_scores ?? {}), [id]: v } }))}
              onChangeRemark={(id, txt) => setDraft((p) => ({ ...p, qualitative_responses: { ...(p.qualitative_responses ?? {}), [id]: txt } }))}
              onUploadEvidence={onUpload}
              onRemoveEvidence={(_, path) => setDraft((p) => ({ ...p, evidence: (p.evidence ?? []).filter((e) => e.path !== path) }))}
            />
          </CardContent>
        </Card>
      )}

      <SelfReviewFieldsCard
        fields={template?.sections.self_review_fields ?? []}
        values={(draft.qualitative_responses ?? {}) as Record<string, string>}
        readOnly={!!locked}
        onChange={(id, txt) =>
          setDraft((p) => ({
            ...p,
            qualitative_responses: { ...(p.qualitative_responses ?? {}), [id]: txt },
          }))
        }
        title={t('section.qualitative', 'Qualitative Responses')}
      />

      <footer className="flex flex-wrap items-center justify-between gap-3 sticky bottom-0 bg-background/80 backdrop-blur border-t py-3">
        <div className="flex flex-col gap-1">
          <div className={`text-xs ${saveStatus === 'pending' ? 'text-amber-600' : saveStatus === 'error' ? 'text-destructive' : 'text-muted-foreground'}`}>
            {locked
              ? t('note.locked', 'Your review is locked.')
              : saveStatus === 'saving' ? t('note.saving', 'Saving draft…')
              : saveStatus === 'saved'   ? t('note.saved', 'Draft saved')
              : saveStatus === 'error'   ? t('note.save_error', 'Could not save — retry your last edit.')
              : saveStatus === 'pending' ? t('note.unsaved', 'Unsaved changes')
              : t('note.draft', 'Draft')}
          </div>
          <AppraisalCompositionCard composition={composition} variant="inline" />
        </div>
        {!locked && (
          <div className="flex gap-2">
            <Button variant="outline" onClick={flush} disabled={saveStatus === 'saving'}>
              {t('btn.save_draft', 'Save draft')}
            </Button>
            <Button onClick={() => { void flush(); setConfirmOpen(true); }} disabled={advance.isPending}>
              {advance.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} {t('btn.submit', 'Submit')}
            </Button>
          </div>
        )}
      </footer>

      <SelfReviewSummaryDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        onConfirm={handleSubmit}
        submitting={advance.isPending}
        template={template}
        draft={draft}
        summary={summary}
        composition={composition}
        evidenceByCriterion={evidenceByCriterion}
      />
    </div>
    </AnnualReviewI18nProvider>
  );
}