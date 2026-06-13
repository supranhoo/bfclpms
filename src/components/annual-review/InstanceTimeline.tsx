import { useInstanceTimeline } from '@/hooks/useAnnualReview';
import { Card, CardContent } from '@/components/ui/card';
import { Loader2, Clock } from 'lucide-react';

const ACTION_LABEL: Record<string, string> = {
  'annual_review.send_back':         'Sent back',
  'annual_review.bulk_finalize':     'Bulk finalized',
  'annual_review.cycle_closed':      'Cycle closed',
  'annual_review.rating_override':   'Rating overridden',
};

function formatMeta(action: string, meta: Record<string, unknown> | null): string {
  if (!meta) return '';
  if (action === 'annual_review.send_back')       return `${meta.from_stage} → ${meta.to_stage}${meta.reason ? ` · ${meta.reason}` : ''}`;
  if (action === 'annual_review.rating_override') return `${meta.from ?? '—'} → ${meta.to ?? '—'} · ${meta.reason ?? ''}`;
  if (action === 'annual_review.bulk_finalize')   return `Rating: ${meta.rating}`;
  return '';
}

export function InstanceTimeline({ instanceId }: { instanceId: string | undefined }) {
  const { data = [], isLoading } = useInstanceTimeline(instanceId);

  if (isLoading) {
    return <div className="flex items-center gap-2 text-sm text-muted-foreground p-3"><Loader2 className="h-4 w-4 animate-spin" /> Loading timeline…</div>;
  }
  if (data.length === 0) {
    return <p className="text-sm text-muted-foreground italic p-3">No audit events recorded yet.</p>;
  }
  return (
    <Card>
      <CardContent className="p-0">
        <ol className="divide-y">
          {data.map((e) => (
            <li key={e.id} className="p-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium text-sm">{ACTION_LABEL[e.action] ?? e.action}</span>
                </div>
                <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                  {new Date(e.created_at).toLocaleString()}
                </span>
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                {e.performer_name ?? (e.performed_by ? 'System user' : 'System')}
                {formatMeta(e.action, e.metadata) && ` · ${formatMeta(e.action, e.metadata)}`}
              </p>
            </li>
          ))}
        </ol>
      </CardContent>
    </Card>
  );
}