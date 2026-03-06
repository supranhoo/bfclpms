import { Lock, ShieldAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ReviewPeriodPermissions } from '@/hooks/useReviewPeriodPermissions';

interface GovernanceLockBannerProps {
  permissions: ReviewPeriodPermissions;
  viewLevel: 'management' | 'auditor' | 'manager' | 'employee';
}

/**
 * Displays a contextual banner when governance locks restrict the current user's actions.
 */
export function GovernanceLockBanner({ permissions, viewLevel }: GovernanceLockBannerProps) {
  if (permissions.isLoading) return null;

  const restrictions: string[] = [];

  if (permissions.view_only) {
    return (
      <Alert variant="destructive" className="border-destructive/30 bg-destructive/5">
        <ShieldAlert className="h-4 w-4" />
        <AlertDescription className="text-sm">
          This review period is in <strong>view-only</strong> mode. No changes can be made.
          {permissions.periodStage && (
            <span className="ml-1 text-muted-foreground">(Stage: {permissions.periodStage.replace(/_/g, ' ')})</span>
          )}
        </AlertDescription>
      </Alert>
    );
  }

  if (!permissions.edit_scores) restrictions.push('score editing');
  if (!permissions.add_comments) restrictions.push('comments');
  if (viewLevel === 'management' && !permissions.approve) restrictions.push('approval');
  if (viewLevel === 'auditor' && !permissions.approve) restrictions.push('forwarding');
  if (viewLevel === 'manager' && !permissions.submit_manager_review) restrictions.push('manager review');

  if (restrictions.length === 0) return null;

  return (
    <Alert className="border-yellow-500/30 bg-yellow-500/5">
      <Lock className="h-4 w-4 text-yellow-600" />
      <AlertDescription className="text-sm">
        Some actions are restricted for this period: <strong>{restrictions.join(', ')}</strong> disabled by governance policy.
      </AlertDescription>
    </Alert>
  );
}
