import { AlertTriangle } from 'lucide-react';
import { useLastSendBackEvent } from '@/hooks/useAnnualReview';

/**
 * ADR-134 — surfaces the most recent send-back on an annual review instance
 * so the employee immediately understands why their review is unlocked and
 * what they need to do next. Renders nothing when no send-back has occurred.
 */
export function SendBackBanner({ instanceId }: { instanceId: string | undefined }) {
  const { data } = useLastSendBackEvent(instanceId);
  if (!data) return null;

  const when = data.sent_back_at
    ? new Date(data.sent_back_at).toLocaleString()
    : null;
  const who = data.performer_name?.trim() || 'Your reviewer';
  const fromStage = (data.from_stage ?? '').replace('_', ' ') || 'a later stage';

  return (
    <div
      role="status"
      className="flex items-start gap-3 rounded-md border border-amber-300 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-500/40 dark:bg-amber-950/40 dark:text-amber-100"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div className="space-y-1">
        <p className="font-medium">Your review was sent back for revision</p>
        <p>
          <strong>{who}</strong> sent this review back from the{' '}
          <strong>{fromStage}</strong> stage
          {when ? <> on <strong>{when}</strong></> : null}. Please review your
          responses and submit again.
        </p>
        {data.reason ? (
          <p>
            <span className="font-medium">Reason:</span> {data.reason}
          </p>
        ) : (
          <p className="text-xs opacity-80">
            No reason was provided. Contact your reviewer if you need clarification.
          </p>
        )}
      </div>
    </div>
  );
}