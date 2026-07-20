import type { AnnualReviewStatus } from '@/types/annualReview';

const STATUS_LABELS: Partial<Record<AnnualReviewStatus, string>> = {
  not_started: 'not started',
  pending_self: 'self review',
  pending_manager: 'manager review',
  pending_skip: 'skip-level review',
  pending_dept: 'department head review',
  pending_bu: 'business unit head review',
  pending_hr: 'HR review',
  completed: 'completed',
  excluded: 'excluded',
};

export function getReadOnlyReviewNotice(status: AnnualReviewStatus): {
  title: string;
  description: string;
} {
  if (status === 'pending_self') {
    return {
      title: 'Assisted submission unavailable',
      description: 'This employee has personal login access, so a manager cannot complete this form. Ask the employee to sign in and open My Annual Review to select options and submit. Their saved draft remains unchanged.',
    };
  }

  const stage = STATUS_LABELS[status] ?? status.replaceAll('_', ' ');
  return {
    title: 'View-only review',
    description: `This review is currently at ${stage}. Only the assigned reviewer for the current stage can edit or submit it; completed self scores remain locked.`,
  };
}