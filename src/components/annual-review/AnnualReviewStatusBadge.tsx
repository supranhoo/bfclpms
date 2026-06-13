import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, STATUS_BADGE_CLASS } from '@/lib/annualReview/constants';
import type { AnnualReviewStatus } from '@/types/annualReview';

export function AnnualReviewStatusBadge({ status, className = '' }: { status: AnnualReviewStatus; className?: string }) {
  return (
    <Badge variant="outline" className={`${STATUS_BADGE_CLASS[status]} ${className}`}>
      {STATUS_LABEL[status]}
    </Badge>
  );
}