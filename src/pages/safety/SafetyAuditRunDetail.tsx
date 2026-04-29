import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Loader2, Send, ShieldCheck, AlertTriangle } from 'lucide-react';
import {
  useAuditRun, useAuditResponses, useAuditTemplate, useAuditTemplateItems,
  useUpsertResponse, useSubmitAuditRun, useReviewAuditRun,
} from '@/hooks/useSafetyAudits';
import {
  SAFETY_AUDIT_ANSWERS,
  SAFETY_AUDIT_ANSWER_LABEL,
  type SafetyAuditAnswer,
  computeAuditScore,
  countCriticalFailures,
  validateAuditSubmission,
  complianceBand,
  COMPLIANCE_BAND_TONE,
  COMPLIANCE_BAND_LABEL,
} from '@/lib/safetyAudits';
import { AuditRunStatusBadge } from '@/components/safety/AuditRunStatusBadge';
import { toast } from 'sonner';

/**
 * Mobile-friendly checklist runner.
 * - In `draft`: each item shows Yes/No/N-A toggle + notes + evidence URL.
 * - On `submit`: server scores + auto-creates incidents for critical NOs.
 * - In `submitted`: privileged roles can mark reviewed with a summary.
 */
export default function SafetyAuditRunDetail() {
  const { id } = useParams<{ id: string }>();
  const { data: run, isLoading } = useAuditRun(id);
  const { data: template } = useAuditTemplate(run?.template_id);
  const { data: items = [] } = useAuditTemplateItems(run?.template_id);
  const { data: responses = [] } = useAuditResponses(id);
  const upsert = useUpsertResponse();
  const submit = useSubmitAuditRun();
  const review = useReviewAuditRun();

  const [summary, setSummary] = useState('');

  const respMap = useMemo(() => {
    const m = new Map<string, typeof responses[number]>();
    for (const r of responses) m.set(r.item_id, r);
    return m;
  }, [responses]);

  const previewPairs = useMemo(
    () => items.map((it) => ({
      item: { weight: it.weight, is_critical: it.is_critical, evidence_required: it.evidence_required },
      response: {
        answer: (respMap.get(it.id)?.answer ?? 'na') as SafetyAuditAnswer,
        evidence_path: respMap.get(it.id)?.evidence_path ?? null,
      },
    })),
    [items, respMap],
  );

  if (isLoading || !run || !template) {
    return (
      <div className="flex items-center justify-center py-10 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading audit…
      </div>
    );
  }

  const isDraft = run.status === 'draft';
  const livePreviewScore = computeAuditScore(previewPairs);
  const liveCritical = countCriticalFailures(previewPairs);
  const band = complianceBand(run.score ?? livePreviewScore);

  async function setAnswer(itemId: string, answer: SafetyAuditAnswer) {
    if (!isDraft || !id) return;
    const existing = respMap.get(itemId);
    try {
      await upsert.mutateAsync({
        run_id: id,
        item_id: itemId,
        answer,
        notes: existing?.notes ?? null,
        evidence_path: existing?.evidence_path ?? null,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed.');
    }
  }

  async function setNotes(itemId: string, notes: string) {
    if (!isDraft || !id) return;
    const existing = respMap.get(itemId);
    try {
      await upsert.mutateAsync({
        run_id: id,
        item_id: itemId,
        answer: (existing?.answer ?? 'na') as SafetyAuditAnswer,
        notes,
        evidence_path: existing?.evidence_path ?? null,
      });
    } catch { /* toast on next persistent failure */ }
  }

  async function setEvidence(itemId: string, path: string) {
    if (!isDraft || !id) return;
    const existing = respMap.get(itemId);
    try {
      await upsert.mutateAsync({
        run_id: id,
        item_id: itemId,
        answer: (existing?.answer ?? 'na') as SafetyAuditAnswer,
        notes: existing?.notes ?? null,
        evidence_path: path,
      });
    } catch { /* */ }
  }

  async function onSubmit() {
    if (!id) return;
    const err = validateAuditSubmission(previewPairs);
    if (err) { toast.error(err); return; }
    try {
      const result = await submit.mutateAsync(id);
      toast.success(`Submitted. Score ${result.score?.toFixed(1)}; ${result.critical_failures} critical incident(s) raised.`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Submit failed.');
    }
  }

  async function onReview() {
    if (!id) return;
    try {
      await review.mutateAsync({ runId: id, summary });
      toast.success('Marked as reviewed.');
      setSummary('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Review failed.');
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/safety/audits"><ArrowLeft className="h-4 w-4 mr-1" /> Back</Link>
        </Button>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[220px]">
              <CardTitle className="text-lg">{template.title}</CardTitle>
              <CardDescription>
                {template.code} · {run.location ?? 'No location'}
              </CardDescription>
            </div>
            <AuditRunStatusBadge status={run.status} />
            <Badge variant={COMPLIANCE_BAND_TONE[band]} className="text-[11px]">
              {(run.score ?? livePreviewScore).toFixed(1)} · {COMPLIANCE_BAND_LABEL[band].split(' ')[0]}
            </Badge>
          </div>
        </CardHeader>
        {isDraft && (
          <CardContent className="text-xs text-muted-foreground flex items-center gap-2">
            <AlertTriangle className="h-3.5 w-3.5" />
            Live preview: {liveCritical} critical NO will create incident(s) on submit.
          </CardContent>
        )}
      </Card>

      {items.map((it) => {
        const r = respMap.get(it.id);
        const answer = (r?.answer ?? 'na') as SafetyAuditAnswer;
        return (
          <Card key={it.id}>
            <CardContent className="py-4 space-y-2">
              <div className="flex items-start gap-2">
                <div className="flex-1">
                  <div className="text-xs text-muted-foreground">{it.section} · w{it.weight}{it.is_critical ? ' · critical' : ''}</div>
                  <div className="text-sm font-medium">{it.prompt}</div>
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                {SAFETY_AUDIT_ANSWERS.map((a) => (
                  <Button
                    key={a}
                    type="button"
                    size="sm"
                    variant={answer === a ? 'default' : 'outline'}
                    disabled={!isDraft}
                    onClick={() => setAnswer(it.id, a)}
                  >
                    {SAFETY_AUDIT_ANSWER_LABEL[a]}
                  </Button>
                ))}
              </div>
              {answer === 'no' && (
                <Input
                  placeholder={it.evidence_required ? 'Evidence URL (required) *' : 'Evidence URL (optional)'}
                  value={r?.evidence_path ?? ''}
                  onChange={(e) => setEvidence(it.id, e.target.value)}
                  disabled={!isDraft}
                />
              )}
              <Textarea
                placeholder="Notes…"
                rows={2}
                value={r?.notes ?? ''}
                onChange={(e) => setNotes(it.id, e.target.value)}
                disabled={!isDraft}
              />
              {r?.auto_incident_id && (
                <Badge variant="destructive" className="text-[10px]">
                  Auto-incident created
                </Badge>
              )}
            </CardContent>
          </Card>
        );
      })}

      {isDraft && (
        <div className="flex justify-end">
          <Button onClick={onSubmit} disabled={submit.isPending}>
            {submit.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Submit Audit
          </Button>
        </div>
      )}

      {run.status === 'submitted' && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4" /> Mark as Reviewed
            </CardTitle>
            <CardDescription>Safety Officer / Head / Admin only.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <Textarea
              placeholder="Reviewer summary (optional)…"
              rows={3}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
            <div className="flex justify-end">
              <Button onClick={onReview} disabled={review.isPending}>
                {review.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <ShieldCheck className="h-4 w-4 mr-2" />}
                Mark Reviewed
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {run.status === 'reviewed' && run.summary && (
        <Card>
          <CardHeader><CardTitle className="text-base">Reviewer Summary</CardTitle></CardHeader>
          <CardContent className="text-sm whitespace-pre-wrap">{run.summary}</CardContent>
        </Card>
      )}
    </div>
  );
}