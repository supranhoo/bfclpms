import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type {
  AnnualReviewResponse,
  AnnualReviewerRole,
} from '@/types/annualReview';

/**
 * Reserved key inside `annual_review_responses.qualitative_responses` for the
 * reviewer's Overall Recommendation. Same pattern as `__variance` justifications
 * (see mem: annual-review overview §variance). Kept in a single constant so
 * downstream surfaces (employee acknowledgment, HR finalization) can filter it
 * out of the criterion-remark list.
 */
export const RECOMMENDATION_KEY = '__overall_recommendation';

const STAGE_LABEL: Record<AnnualReviewerRole, string> = {
  self: 'Self',
  manager: 'Manager',
  skip_manager: 'Skip Manager',
  dept_head: 'Department Head',
  bu_head: 'BU Head',
  hr: 'HR',
};

/** Roles that may author an overall recommendation. */
export const RECOMMENDATION_ROLES: readonly AnnualReviewerRole[] = [
  'dept_head',
  'bu_head',
];

/**
 * Extracts non-empty recommendations from a set of responses, in stage order.
 * Exported so the employee results view can reuse the same filter without
 * re-implementing the reserved-key lookup.
 */
export function collectRecommendations(
  responses: Pick<AnnualReviewResponse, 'reviewer_role' | 'qualitative_responses'>[],
): Array<{ role: AnnualReviewerRole; text: string }> {
  const order: AnnualReviewerRole[] = [
    'self',
    'manager',
    'skip_manager',
    'dept_head',
    'bu_head',
    'hr',
  ];
  const byRole = new Map<AnnualReviewerRole, string>();
  for (const r of responses) {
    const raw = (r.qualitative_responses ?? {})[RECOMMENDATION_KEY];
    const txt = (raw ?? '').trim();
    if (txt) byRole.set(r.reviewer_role, txt);
  }
  return order
    .filter((role) => byRole.has(role))
    .map((role) => ({ role, text: byRole.get(role)! }));
}

/**
 * Overall Recommendation card for the annual review detail page.
 *
 * Editable when the current viewer is a Dept Head or BU Head on their own
 * unlocked stage. Read-only aggregate list otherwise (still renders when there
 * is at least one prior recommendation, so later reviewers and the employee
 * can see it).
 */
export function OverallRecommendationCard({
  role,
  locked,
  draftValue,
  onChangeDraft,
  responses,
  reviewerNames,
}: {
  role: AnnualReviewerRole | null;
  locked: boolean;
  draftValue: string;
  onChangeDraft: (v: string) => void;
  responses: Pick<AnnualReviewResponse, 'reviewer_role' | 'qualitative_responses'>[];
  reviewerNames?: Partial<Record<AnnualReviewerRole, string | null>>;
}) {
  const canEdit =
    !!role && !locked && RECOMMENDATION_ROLES.includes(role);

  const previous = collectRecommendations(
    responses.filter((r) => r.reviewer_role !== role),
  );

  if (!canEdit && previous.length === 0) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Overall recommendation</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {previous.length > 0 && (
          <div className="space-y-2">
            {previous.map((rec) => (
              <div key={rec.role} className="rounded-md border p-3 bg-muted/30">
                <p className="text-xs font-medium text-muted-foreground">
                  {STAGE_LABEL[rec.role]}
                  {reviewerNames?.[rec.role] ? ` — ${reviewerNames[rec.role]}` : ''}
                </p>
                <p className="text-sm whitespace-pre-wrap mt-1">{rec.text}</p>
              </div>
            ))}
          </div>
        )}

        {canEdit && (
          <div className="space-y-1.5">
            <Label htmlFor="ar-overall-recommendation">
              Your recommendation (optional)
            </Label>
            <Textarea
              id="ar-overall-recommendation"
              rows={4}
              value={draftValue}
              onChange={(e) => onChangeDraft(e.target.value)}
              placeholder="e.g. Recommend for promotion, rotation to Ops, additional coaching…"
            />
            <p className="text-xs text-muted-foreground">
              Shared with the next reviewer, HR, and the employee at
              acknowledgment. Do not include confidential HR-only notes.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}