import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useAcknowledgeInstance } from '@/hooks/useAnnualReview';
import type {
  AnnualReviewInstance, AnnualReviewResponse, AnnualReviewTemplate,
} from '@/types/annualReview';
import { collectRecommendations } from './OverallRecommendationCard';
import { displayStageForResponse } from '@/lib/annualReview/displayStageForResponse';

/**
 * Read-only finalized view for the employee: HR rating + remarks, criteria-by-criteria
 * scores across reviewers, and an acknowledgment action with optional rebuttal note.
 */
export function EmployeeResultsView({
  instance, template, responses,
}: {
  instance: AnnualReviewInstance;
  template: AnnualReviewTemplate | null | undefined;
  responses: AnnualReviewResponse[];
}) {
  const ack = useAcknowledgeInstance();
  const [open, setOpen] = useState(false);
  const [rebuttal, setRebuttal] = useState('');

  const criteria = template?.sections.criteria ?? [];
  // POLICY §AR-STAGE-LABEL-DISPLAY-SSOT (ADR-128): remap responses onto their
  // effective display stage so duplicate-reviewer collapses (e.g. Dept≡BU)
  // render under the winning column (BU), matching the header.
  const byRole = new Map<typeof responses[number]['reviewer_role'], typeof responses[number]>();
  for (const r of responses) {
    const display = displayStageForResponse(
      { reviewer_role: r.reviewer_role, reviewer_id: (r as any).reviewer_id ?? null },
      instance as any,
      responses.map((x) => ({
        reviewer_role: x.reviewer_role,
        reviewer_id: (x as any).reviewer_id ?? null,
      })),
    );
    if (!byRole.has(display)) byRole.set(display, r);
  }
  const recommendations = collectRecommendations(responses, instance as any);
  const stageLabel: Record<string, string> = {
    self: 'Self', manager: 'Manager', skip_manager: 'Skip Manager',
    dept_head: 'Department Head', bu_head: 'BU Head', hr: 'HR',
  };

  const onAck = async () => {
    try {
      await ack.mutateAsync({ instanceId: instance.id, rebuttal: rebuttal.trim() || null });
      toast.success('Acknowledgment recorded.');
      setOpen(false);
    } catch (e) { toast.error((e as Error).message); }
  };

  const acknowledged = !!instance.acknowledged_at;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle>Your Final Review</CardTitle>
              <p className="text-sm text-muted-foreground">
                Finalized {instance.finalized_at ? new Date(instance.finalized_at).toLocaleDateString() : '—'}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {instance.final_rating && (
                <Badge variant="outline" className="text-base px-3 py-1">
                  {instance.final_rating}
                </Badge>
              )}
              {acknowledged && (
                <Badge className="bg-emerald-500/15 text-emerald-500 border-emerald-500/30">
                  <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Acknowledged
                </Badge>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Total score</p>
              <p className="text-2xl font-semibold tabular-nums">
                {instance.total_score != null ? instance.total_score.toFixed(2) : '—'}
              </p>
            </div>
            <div className="rounded-md border p-3">
              <p className="text-xs text-muted-foreground">Criteria weighted score</p>
              <p className="text-2xl font-semibold tabular-nums">
                {instance.criteria_weighted_score != null ? instance.criteria_weighted_score.toFixed(2) : '—'}
              </p>
              {(() => {
                const maxCriteria = (criteria ?? []).reduce(
                  (acc, c) => acc + (Number(c.weight) || 0) * 5,
                  0,
                );
                const raw = instance.criteria_weighted_score;
                if (raw == null || maxCriteria <= 0) return null;
                const rating = (raw / maxCriteria) * 5;
                return (
                  <p className="text-xs text-muted-foreground mt-1">
                    ≈ {rating.toFixed(1)} / 5
                  </p>
                );
              })()}
            </div>
          </div>

          {instance.hr_remarks && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">HR remarks</Label>
              <p className="text-sm whitespace-pre-wrap rounded-md border p-3 bg-muted/30">
                {instance.hr_remarks}
              </p>
            </div>
          )}

          {instance.employee_rebuttal && (
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                Your acknowledgment note · {instance.acknowledged_at && new Date(instance.acknowledged_at).toLocaleString()}
              </Label>
              <p className="text-sm whitespace-pre-wrap rounded-md border p-3 bg-muted/30">
                {instance.employee_rebuttal}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {criteria.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Criteria scores</CardTitle></CardHeader>
          <CardContent className="p-0 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3 font-medium">Criterion</th>
                  <th className="p-3 font-medium text-right">Self</th>
                  <th className="p-3 font-medium text-right">Manager</th>
                  <th className="p-3 font-medium text-right">Skip</th>
                  <th className="p-3 font-medium text-right">BU</th>
                  <th className="p-3 font-medium text-right">HR</th>
                </tr>
              </thead>
              <tbody>
                {criteria.map((c) => (
                  <tr key={c.id} className="border-t">
                    <td className="p-3">{c.name}</td>
                    {(['self','manager','skip_manager','bu_head','hr'] as const).map((role) => {
                      const v = byRole.get(role)?.criteria_scores?.[c.id];
                      return (
                        <td key={role} className="p-3 text-right tabular-nums text-muted-foreground">
                          {typeof v === 'number' ? v.toFixed(1) : '—'}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}

      {recommendations.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">Recommendations</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {recommendations.map((rec) => (
              <div key={rec.role} className="rounded-md border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">
                  {stageLabel[rec.role] ?? rec.role}
                </p>
                <p className="text-sm whitespace-pre-wrap mt-1">{rec.text}</p>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {!acknowledged && (
        <div className="sticky bottom-0 bg-background/80 backdrop-blur border-t py-3 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            Please acknowledge that you have reviewed your final rating. You may optionally add a rebuttal note.
          </p>
          <Button onClick={() => setOpen(true)}>
            <CheckCircle2 className="h-4 w-4 mr-2" /> Acknowledge
          </Button>
        </div>
      )}

      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Acknowledge your final review?</AlertDialogTitle>
            <AlertDialogDescription>
              This confirms you have seen your final rating. Acknowledgment is permanent and audit-logged.
              You may optionally add a rebuttal note, which HR will see.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="ar-rebuttal">Rebuttal note (optional)</Label>
            <Textarea
              id="ar-rebuttal"
              rows={4}
              value={rebuttal}
              onChange={(e) => setRebuttal(e.target.value)}
              placeholder="Anything you'd like to record about this rating…"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); onAck(); }} disabled={ack.isPending}>
              {ack.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />} Acknowledge
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}