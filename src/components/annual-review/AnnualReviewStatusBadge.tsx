import { Badge } from '@/components/ui/badge';
import { STATUS_LABEL, STATUS_BADGE_CLASS } from '@/lib/annualReview/constants';
import type { AnnualReviewStatus } from '@/types/annualReview';
import { useAnnualReviewI18n } from '@/components/annual-review/AnnualReviewI18nContext';

export function AnnualReviewStatusBadge({ status, className = '' }: { status: AnnualReviewStatus; className?: string }) {
  const { t } = useAnnualReviewI18n();
  return (
    <Badge variant="outline" className={`${STATUS_BADGE_CLASS[status]} ${className}`}>
      {t(`status.${status}`, STATUS_LABEL[status])}
    </Badge>
  );
}