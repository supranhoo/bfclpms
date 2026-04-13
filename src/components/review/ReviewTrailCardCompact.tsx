import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { User, Shield, Briefcase, FileText, ExternalLink, AlertCircle } from 'lucide-react';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { RatingLevel, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';

import { getRatingLevelColor, ratingLevelToLabel } from '@/lib/reviewConstants';

const getRatingLabel = (rating: RatingLevel | null | undefined) => {
  if (!rating) return 'N/A';
  return ratingLevelToLabel(rating);
};

const getRatingColor = (rating: RatingLevel | null | undefined) => {
  if (!rating) return '#6B7280';
  return getRatingLevelColor(rating);
};

interface ReviewTrailCardCompactProps {
  submission: ReviewSubmission | undefined;
  achievedValue?: number | null;
  showSelf?: boolean;
  showManager?: boolean;
  showAuditor?: boolean;
  showManagement?: boolean;
  queries?: KpiQuery[];
  kpiName?: string | null;
  employeeCode?: string | null;
}

export function ReviewTrailCardCompact({ 
  submission, 
  achievedValue,
  showSelf = true, 
  showManager = true, 
  showAuditor = false,
  showManagement = false,
  queries = [],
  kpiName,
}: ReviewTrailCardCompactProps) {
  if (!submission) return null;

  const openQueries = queries.filter(q => q.status === 'open');

  const ReviewStageItem = ({ 
    icon: Icon, 
    iconColor,
    borderColor,
    title, 
    score, 
    rating, 
    remarks, 
    evidenceUrl,
    evidenceUrls,
    isNa
  }: {
    icon: typeof User;
    iconColor: string;
    borderColor: string;
    title: string;
    score: number | null | undefined;
    rating: RatingLevel | null | undefined;
    remarks: string | null | undefined;
    evidenceUrl: string | null | undefined;
    evidenceUrls?: any;
    isNa?: boolean;
  }) => (
    <div className={`p-3 border rounded-lg ${borderColor}`}>
      <div className="flex items-center gap-2 mb-2">
        <div className={`h-5 w-5 rounded-full ${iconColor} flex items-center justify-center`}>
          <Icon className="h-3 w-3" />
        </div>
        <span className="text-xs font-medium">{title}</span>
        {isNa ? (
          <Badge variant="outline" className="ml-auto text-xs">N/A</Badge>
        ) : rating ? (
          <Badge 
            style={{ backgroundColor: getRatingColor(rating) }} 
            className="text-white ml-auto text-xs px-1.5 py-0"
          >
            {score} - {getRatingLabel(rating)}
          </Badge>
        ) : (
          <Badge variant="outline" className="ml-auto text-xs">Pending</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground line-clamp-2">{remarks || 'No remarks'}</p>
      {(() => {
        const urls: string[] = Array.isArray(evidenceUrls) && evidenceUrls.length > 0
          ? evidenceUrls
          : evidenceUrl ? [evidenceUrl] : [];
        if (urls.length === 0) return null;
        return (
          <div className="space-y-0.5 mt-1">
            {urls.map((url: string, idx: number) => (
              <button 
                key={idx}
                type="button"
                onClick={() => openStorageFile(url, buildEvidenceFileName(url, kpiName, title, idx, urls.length))}
                className="inline-flex items-center gap-1 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
              >
                <FileText className="h-3 w-3" />
                Evidence{urls.length > 1 ? ` ${idx + 1}` : ''}
                <ExternalLink className="h-2.5 w-2.5" />
              </button>
            ))}
          </div>
        );
      })()}
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Open Queries Alert - Compact */}
      {openQueries.length > 0 && (
        <div className="flex items-center gap-2 p-2 border border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800 rounded-lg">
          <AlertCircle className="h-4 w-4 text-orange-600 flex-shrink-0" />
          <span className="text-xs font-medium text-orange-800 dark:text-orange-200">
            {openQueries.length} Open {openQueries.length === 1 ? 'Query' : 'Queries'}
          </span>
          <span className="text-xs text-orange-600 truncate flex-1">{openQueries[0]?.reason}</span>
        </div>
      )}

      {/* Achievement Display - Compact Inline */}
      {achievedValue !== undefined && submission?.achieved_value && (
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">Achieved:</span>
          <span className="font-bold text-primary text-lg">
            {submission?.is_na ? 'N/A' : submission.achieved_value}
          </span>
          {!submission?.is_na && (
            <Badge variant="outline" className="text-xs">
              {((submission.achieved_value / achievedValue) * 100).toFixed(1)}% of target
            </Badge>
          )}
        </div>
      )}

      {/* Review Stages - Horizontal Grid */}
      <div className="grid grid-cols-4 gap-3">
        {showSelf && (
          <ReviewStageItem
            icon={User}
            iconColor="bg-blue-500/10 text-blue-500"
            borderColor="border-blue-200 dark:border-blue-800"
            title="Self"
            score={submission?.self_score}
            rating={submission?.self_rating}
            remarks={submission?.self_remarks}
            evidenceUrl={submission?.self_evidence_url}
            evidenceUrls={submission?.self_evidence_urls}
            isNa={submission?.is_na}
          />
        )}
        {showManager && (
          <ReviewStageItem
            icon={Briefcase}
            iconColor="bg-amber-500/10 text-amber-500"
            borderColor="border-amber-200 dark:border-amber-800"
            title="Manager"
            score={submission?.manager_score}
            rating={submission?.manager_rating}
            remarks={submission?.manager_remarks}
            evidenceUrl={submission?.manager_evidence_url}
            evidenceUrls={submission?.manager_evidence_urls}
            isNa={submission?.is_na}
          />
        )}
        {showAuditor && (
          <ReviewStageItem
            icon={Shield}
            iconColor="bg-purple-500/10 text-purple-500"
            borderColor="border-purple-200 dark:border-purple-800"
            title="Auditor"
            score={submission?.auditor_score}
            rating={submission?.auditor_rating}
            remarks={submission?.auditor_remarks}
            evidenceUrl={submission?.auditor_evidence_url}
            evidenceUrls={submission?.auditor_evidence_urls}
            isNa={submission?.is_na}
          />
        )}
        {showManagement && (
          <ReviewStageItem
            icon={Briefcase}
            iconColor="bg-emerald-500/10 text-emerald-500"
            borderColor="border-emerald-200 dark:border-emerald-800"
            title="Management"
            score={submission?.management_score}
            rating={submission?.management_rating}
            remarks={submission?.management_remarks}
            evidenceUrl={submission?.management_evidence_url}
            evidenceUrls={submission?.management_evidence_urls}
            isNa={submission?.is_na}
          />
        )}
      </div>
    </div>
  );
}
