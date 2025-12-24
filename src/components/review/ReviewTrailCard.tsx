import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { User, Shield, Briefcase } from 'lucide-react';
import { RatingLevel, ReviewSubmission } from '@/hooks/useKpis';

const ratingOptions: { value: RatingLevel; label: string; color: string; score: number }[] = [
  { value: 'blue', label: 'Outstanding', color: '#3B82F6', score: 5 },
  { value: 'green', label: 'Exceeds Expectations', color: '#10B981', score: 4 },
  { value: 'yellow', label: 'Meets Expectations', color: '#F59E0B', score: 3 },
  { value: 'red', label: 'Below Expectations', color: '#EF4444', score: 2 },
];

const getRatingLabel = (rating: RatingLevel | null | undefined) => {
  return ratingOptions.find(r => r.value === rating)?.label || 'N/A';
};

const getRatingColor = (rating: RatingLevel | null | undefined) => {
  return ratingOptions.find(r => r.value === rating)?.color || '#6B7280';
};

interface ReviewTrailCardProps {
  submission: ReviewSubmission | undefined;
  achievedValue?: number | null;
  showSelf?: boolean;
  showManager?: boolean;
  showAuditor?: boolean;
  showManagement?: boolean;
}

export function ReviewTrailCard({ 
  submission, 
  achievedValue,
  showSelf = true, 
  showManager = true, 
  showAuditor = false,
  showManagement = false 
}: ReviewTrailCardProps) {
  if (!submission) return null;

  return (
    <div className="space-y-4">
      {/* Achievement Info */}
      {achievedValue !== undefined && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Achieved Value</p>
                <p className="text-2xl font-bold text-primary">
                  {submission?.is_na ? 'N/A' : (submission?.achieved_value ?? '-')}
                </p>
              </div>
              {submission?.achieved_value && achievedValue && (
                <Badge variant="outline" className="text-sm">
                  {((submission.achieved_value / achievedValue) * 100).toFixed(1)}% of target
                </Badge>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-2 gap-4">
        {/* Self Review */}
        {showSelf && (
          <Card className="border-blue-200 dark:border-blue-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-full bg-blue-500/10 flex items-center justify-center">
                  <User className="h-3.5 w-3.5 text-blue-500" />
                </div>
                <p className="text-sm font-medium">Self Review</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rating</span>
                  {submission?.is_na ? (
                    <Badge variant="outline">N/A</Badge>
                  ) : (
                    <Badge 
                      style={{ backgroundColor: getRatingColor(submission?.self_rating) }} 
                      className="text-white"
                    >
                      {submission?.self_score} - {getRatingLabel(submission?.self_rating)}
                    </Badge>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Remarks</span>
                  <p className="text-sm mt-1 line-clamp-3">
                    {submission?.self_remarks || 'No remarks'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Manager Review */}
        {showManager && (
          <Card className="border-amber-200 dark:border-amber-800">
            <CardContent className="pt-4">
              <div className="flex items-center gap-2 mb-3">
                <div className="h-6 w-6 rounded-full bg-amber-500/10 flex items-center justify-center">
                  <Briefcase className="h-3.5 w-3.5 text-amber-500" />
                </div>
                <p className="text-sm font-medium">Manager Review</p>
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Rating</span>
                  {submission?.is_na ? (
                    <Badge variant="outline">N/A</Badge>
                  ) : submission?.manager_rating ? (
                    <Badge 
                      style={{ backgroundColor: getRatingColor(submission?.manager_rating) }} 
                      className="text-white"
                    >
                      {submission?.manager_score} - {getRatingLabel(submission?.manager_rating)}
                    </Badge>
                  ) : (
                    <Badge variant="outline">Pending</Badge>
                  )}
                </div>
                <div>
                  <span className="text-xs text-muted-foreground">Remarks</span>
                  <p className="text-sm mt-1 line-clamp-3">
                    {submission?.manager_remarks || 'No remarks'}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Auditor and Management Reviews */}
      {(showAuditor || showManagement) && (
        <div className="grid grid-cols-2 gap-4">
          {showAuditor && (
            <Card className="border-purple-200 dark:border-purple-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 rounded-full bg-purple-500/10 flex items-center justify-center">
                    <Shield className="h-3.5 w-3.5 text-purple-500" />
                  </div>
                  <p className="text-sm font-medium">Auditor Review</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Rating</span>
                    {submission?.is_na ? (
                      <Badge variant="outline">N/A</Badge>
                    ) : submission?.auditor_rating ? (
                      <Badge 
                        style={{ backgroundColor: getRatingColor(submission?.auditor_rating) }} 
                        className="text-white"
                      >
                        {submission?.auditor_score} - {getRatingLabel(submission?.auditor_rating)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Remarks</span>
                    <p className="text-sm mt-1 line-clamp-3">
                      {submission?.auditor_remarks || 'No remarks'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {showManagement && (
            <Card className="border-emerald-200 dark:border-emerald-800">
              <CardContent className="pt-4">
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-6 w-6 rounded-full bg-emerald-500/10 flex items-center justify-center">
                    <Briefcase className="h-3.5 w-3.5 text-emerald-500" />
                  </div>
                  <p className="text-sm font-medium">Management Review</p>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Rating</span>
                    {submission?.is_na ? (
                      <Badge variant="outline">N/A</Badge>
                    ) : (submission as any)?.management_rating ? (
                      <Badge 
                        style={{ backgroundColor: getRatingColor((submission as any)?.management_rating) }} 
                        className="text-white"
                      >
                        {(submission as any)?.management_score} - {getRatingLabel((submission as any)?.management_rating)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Remarks</span>
                    <p className="text-sm mt-1 line-clamp-3">
                      {(submission as any)?.management_remarks || 'No remarks'}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}

export { ratingOptions, getRatingLabel, getRatingColor };
