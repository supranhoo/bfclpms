import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { User, Shield, Briefcase, FileText, ExternalLink, MessageSquare, AlertCircle, AlertTriangle } from 'lucide-react';
import { openStorageFile, buildEvidenceFileName } from '@/lib/storageDownload';
import { RatingLevel, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { format } from 'date-fns';

import { ratingOptions, getRatingLevelColor, ratingLevelToLabel } from '@/lib/reviewConstants';

const getRatingLabel = (rating: RatingLevel | null | undefined) => {
  if (!rating) return 'N/A';
  return ratingLevelToLabel(rating);
};

const getRatingColor = (rating: RatingLevel | null | undefined) => {
  if (!rating) return '#6B7280';
  return getRatingLevelColor(rating);
};

interface ReviewTrailCardProps {
  submission: ReviewSubmission | undefined;
  achievedValue?: number | null;
  showSelf?: boolean;
  showManager?: boolean;
  showAuditor?: boolean;
  showManagement?: boolean;
  queries?: KpiQuery[];
  kpiName?: string | null;
}

export function ReviewTrailCard({ 
  submission, 
  achievedValue,
  showSelf = true, 
  showManager = true, 
  showAuditor = false,
  showManagement = false,
  queries = [],
  kpiName,
}: ReviewTrailCardProps) {
  if (!submission) return null;

  const openQueries = queries.filter(q => q.status === 'open');
  const resolvedQueries = queries.filter(q => q.status === 'resolved');

  return (
    <div className="space-y-4">
      {/* Auto-Advance Warning */}
      {(submission as any)?.auto_advance_reason && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <AlertTriangle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-orange-800 dark:text-orange-200">Auto-Advanced by System</p>
                <p className="text-sm text-orange-700 dark:text-orange-300 mt-1">
                  {(submission as any).auto_advance_reason}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
      {/* Query Alert if any open queries */}
      {openQueries.length > 0 && (
        <Card className="border-orange-300 bg-orange-50 dark:bg-orange-950/30 dark:border-orange-800">
          <CardContent className="pt-4">
            <div className="flex items-start gap-3">
              <div className="h-8 w-8 rounded-full bg-orange-500/20 flex items-center justify-center flex-shrink-0">
                <AlertCircle className="h-4 w-4 text-orange-600 dark:text-orange-400" />
              </div>
              <div className="flex-1">
                <p className="font-medium text-orange-800 dark:text-orange-200">
                  {openQueries.length} Open {openQueries.length === 1 ? 'Query' : 'Queries'}
                </p>
                <div className="mt-2 space-y-2">
                  {openQueries.map(q => (
                    <div key={q.id} className="p-2 bg-white/50 dark:bg-black/20 rounded text-sm">
                      <p className="text-orange-900 dark:text-orange-100">{q.reason}</p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Raised on {format(new Date(q.created_at), 'dd MMM yyyy')}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

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
              {submission?.achieved_value && achievedValue && !submission?.is_na && (
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
                  <span className="text-xs text-muted-foreground">Score</span>
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
                  <span className="text-xs text-muted-foreground">Justification</span>
                  <p className="text-sm mt-1 line-clamp-3">
                    {submission?.self_remarks || 'No remarks'}
                  </p>
                </div>
                {/* Evidence Links */}
                {(() => {
                  const urls: string[] = Array.isArray((submission as any)?.self_evidence_urls) && (submission as any).self_evidence_urls.length > 0
                    ? (submission as any).self_evidence_urls
                    : submission?.self_evidence_url ? [submission.self_evidence_url] : [];
                  if (urls.length === 0) return null;
                  return (
                    <div className="pt-2 border-t space-y-1">
                      {urls.map((url: string, idx: number) => (
                        <button 
                          key={idx}
                          type="button"
                          onClick={() => openStorageFile(url, buildEvidenceFileName(url, kpiName, 'Self', idx, urls.length))}
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                        >
                          <FileText className="h-3 w-3" />
                          View Evidence{urls.length > 1 ? ` ${idx + 1}` : ''}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  );
                })()}
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
                  <span className="text-xs text-muted-foreground">Score</span>
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
                  <span className="text-xs text-muted-foreground">Justification</span>
                  <p className="text-sm mt-1 line-clamp-3">
                    {submission?.manager_remarks || 'No remarks'}
                  </p>
                </div>
                {/* Evidence Links */}
                {(() => {
                  const urls: string[] = Array.isArray((submission as any)?.manager_evidence_urls) && (submission as any).manager_evidence_urls.length > 0
                    ? (submission as any).manager_evidence_urls
                    : submission?.manager_evidence_url ? [submission.manager_evidence_url] : [];
                  if (urls.length === 0) return null;
                  return (
                    <div className="pt-2 border-t space-y-1">
                      {urls.map((url: string, idx: number) => (
                        <button 
                          key={idx}
                          type="button"
                          onClick={() => openStorageFile(url, buildEvidenceFileName(url, kpiName, 'Manager', idx, urls.length))}
                          className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                        >
                          <FileText className="h-3 w-3" />
                          View Evidence{urls.length > 1 ? ` ${idx + 1}` : ''}
                          <ExternalLink className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  );
                })()}
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
                    <span className="text-xs text-muted-foreground">Score</span>
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
                    <span className="text-xs text-muted-foreground">Justification</span>
                    <p className="text-sm mt-1 line-clamp-3">
                      {submission?.auditor_remarks || 'No remarks'}
                    </p>
                  </div>
                  {/* Evidence Links */}
                  {(() => {
                    const urls: string[] = Array.isArray((submission as any)?.auditor_evidence_urls) && (submission as any).auditor_evidence_urls.length > 0
                      ? (submission as any).auditor_evidence_urls
                      : submission?.auditor_evidence_url ? [submission.auditor_evidence_url] : [];
                    if (urls.length === 0) return null;
                    return (
                      <div className="pt-2 border-t space-y-1">
                        {urls.map((url: string, idx: number) => (
                          <button 
                            key={idx}
                            type="button"
                            onClick={() => openStorageFile(url, buildEvidenceFileName(url, kpiName, 'Auditor', idx, urls.length))}
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                          >
                            <FileText className="h-3 w-3" />
                            View Evidence{urls.length > 1 ? ` ${idx + 1}` : ''}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    );
                  })()}
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
                    <span className="text-xs text-muted-foreground">Score</span>
                    {submission?.is_na ? (
                      <Badge variant="outline">N/A</Badge>
                    ) : submission?.management_rating ? (
                      <Badge 
                        style={{ backgroundColor: getRatingColor(submission?.management_rating) }} 
                        className="text-white"
                      >
                        {submission?.management_score} - {getRatingLabel(submission?.management_rating)}
                      </Badge>
                    ) : (
                      <Badge variant="outline">Pending</Badge>
                    )}
                  </div>
                  <div>
                    <span className="text-xs text-muted-foreground">Justification</span>
                    <p className="text-sm mt-1 line-clamp-3">
                      {submission?.management_remarks || 'No remarks'}
                    </p>
                  </div>
                  {/* Evidence Links */}
                  {(() => {
                    const urls: string[] = Array.isArray((submission as any)?.management_evidence_urls) && (submission as any).management_evidence_urls.length > 0
                      ? (submission as any).management_evidence_urls
                      : submission?.management_evidence_url ? [submission.management_evidence_url] : [];
                    if (urls.length === 0) return null;
                    return (
                      <div className="pt-2 border-t space-y-1">
                        {urls.map((url: string, idx: number) => (
                          <button 
                            key={idx}
                            type="button"
                            onClick={() => openStorageFile(url, buildEvidenceFileName(url, kpiName, 'Management', idx, urls.length))}
                            className="inline-flex items-center gap-1.5 text-xs text-primary hover:underline cursor-pointer bg-transparent border-none p-0"
                          >
                            <FileText className="h-3 w-3" />
                            View Evidence{urls.length > 1 ? ` ${idx + 1}` : ''}
                            <ExternalLink className="h-3 w-3" />
                          </button>
                        ))}
                      </div>
                    );
                  })()}
                </div>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Query History */}
      {resolvedQueries.length > 0 && (
        <Card className="border-muted">
          <CardContent className="pt-4">
            <div className="flex items-center gap-2 mb-3">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Query History</p>
            </div>
            <div className="space-y-2">
              {resolvedQueries.map(q => (
                <div key={q.id} className="p-3 bg-muted/50 rounded-lg text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium">Query: {q.reason}</p>
                      {q.resolution_notes && (
                        <p className="text-muted-foreground mt-1">
                          Resolution: {q.resolution_notes}
                        </p>
                      )}
                    </div>
                    <Badge variant="outline" className="text-green-600 border-green-300 flex-shrink-0">
                      Resolved
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Raised: {format(new Date(q.created_at), 'dd MMM yyyy')}
                    {q.resolved_at && ` • Resolved: ${format(new Date(q.resolved_at), 'dd MMM yyyy')}`}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

export { ratingOptions, getRatingLabel, getRatingColor };
