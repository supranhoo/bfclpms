import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ReviewStageCard, StageStatus } from './ReviewStageCard';
import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { User, Briefcase, Shield, MessageSquare, History, UserCheck, ClipboardCheck, AlertTriangle } from 'lucide-react';
import { getVisibleJourneyStages, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { calculateRating, RatingThresholds, ratingToLevel } from '@/lib/ratingCalculation';
import { UomType } from '@/lib/qualitativeUom';

type ViewLevel = 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' | 'admin';
type JourneyStage = 'self' | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management';

interface KpiJourneySectionProps {
  kpi: KPI;
  submission: ReviewSubmission | null;
  queries?: KpiQuery[];
  viewLevel: ViewLevel;
  onOpenQueryHistory?: () => void;
  workflowStages?: string[];
}

// Determine the status of each review stage based on KPI status and view level
function getStageStatus(
  stage: JourneyStage,
  kpiStatus: string,
  viewLevel: ViewLevel,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): StageStatus {
  const statusOrder = workflowStages;
  const stageToStatus: Record<string, string> = {
    self: 'self_review',
    manager: 'manager_check',
    skip_level: 'skip_level_check',
    hr_pms: 'hr_pms_review',
    auditor: 'audit',
    management: 'management_review',
  };

  const stageStartStatus = stageToStatus[stage];
  const stageStartIndex = statusOrder.indexOf(stageStartStatus);
  const currentIndex = statusOrder.indexOf(kpiStatus);

  // Check if stage is completed
  if (currentIndex > stageStartIndex) {
    return 'completed';
  }

  // Check if this is the current stage
  if (kpiStatus === stageStartStatus) {
    return 'current';
  }

  return 'pending';
}

// Get visible stages based on workflow
function getVisibleStagesForLevel(
  _viewLevel: ViewLevel,
  workflowStages: string[] = DEFAULT_WORKFLOW_STAGES
): JourneyStage[] {
  return getVisibleJourneyStages(workflowStages);
}

export function KpiJourneySection({
  kpi,
  submission,
  queries = [],
  viewLevel,
  onOpenQueryHistory,
  workflowStages,
}: KpiJourneySectionProps) {
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const kpiStatus = kpi.status || 'kra_set';
  const visibleStages = getVisibleStagesForLevel(viewLevel, effectiveStages);
  const globalIsNA = submission?.is_na || false;

  // Recalculate score from achieved value using current KPI thresholds
  const recalcScore = (achievedValue: number | string | null | undefined): { score: number; rating: string } | null => {
    if (achievedValue === null || achievedValue === undefined || achievedValue === '') return null;
    const thresholds: RatingThresholds = {
      r5: kpi.r5 ?? null,
      r4: kpi.r4 ?? null,
      r3: kpi.r3 ?? null,
      r2: kpi.r2 ?? null,
      r1: kpi.r1 ?? null,
      r0: kpi.r0 ?? null,
    };
    const result = calculateRating(
      achievedValue,
      kpi.target_value ?? null,
      thresholds,
      kpi.criteria || 'Higher is Better',
      0, // weightage not needed for display
      (kpi.uom_type as UomType) || 'numeric',
      kpi.qualitative_options as any,
      kpi.uom,
      (kpi.threshold_mode as 'absolute' | 'ratio') || 'absolute'
    );
    return { score: result.rating, rating: result.ratingLevel };
  };

  const openQueries = queries.filter(q => q.status === 'open').length;
  const resolvedQueries = queries.filter(q => q.status === 'resolved').length;

  const buildEvidenceUrls = (urlsField: any, urlField: any): string[] => {
    if (Array.isArray(urlsField) && urlsField.length > 0) return urlsField;
    if (urlField) return [urlField];
    return [];
  };

  const stageData: Record<JourneyStage, {
    icon: typeof User;
    iconColor: 'blue' | 'amber' | 'purple' | 'emerald' | 'teal' | 'rose';
    title: string;
    score: number | null;
    rating: any;
    remarks: string | null;
    evidenceUrls: string[];
    achievedValue: number | null;
  }> = {
    self: {
      icon: User,
      iconColor: 'blue',
      title: 'Self',
      score: submission?.self_score ?? null,
      rating: submission?.self_rating ?? null,
      remarks: submission?.self_remarks ?? null,
      evidenceUrls: buildEvidenceUrls(submission?.self_evidence_urls, submission?.self_evidence_url),
      achievedValue: submission?.achieved_value ?? null,
    },
    manager: {
      icon: Briefcase,
      iconColor: 'amber',
      title: 'Manager',
      score: submission?.manager_score ?? null,
      rating: submission?.manager_rating ?? null,
      remarks: submission?.manager_remarks ?? null,
      evidenceUrls: buildEvidenceUrls(submission?.manager_evidence_urls, submission?.manager_evidence_url),
      achievedValue: submission?.manager_achieved_value ?? null,
    },
    skip_level: {
      icon: UserCheck,
      iconColor: 'teal',
      title: 'Skip-Level',
      score: submission?.skip_level_score ?? null,
      rating: submission?.skip_level_rating ?? null,
      remarks: submission?.skip_level_remarks ?? null,
      evidenceUrls: buildEvidenceUrls(submission?.skip_level_evidence_urls, submission?.skip_level_evidence_url),
      achievedValue: submission?.skip_level_achieved_value ?? null,
    },
    hr_pms: {
      icon: ClipboardCheck,
      iconColor: 'rose',
      title: 'HR PMS',
      score: submission?.hr_pms_score ?? null,
      rating: submission?.hr_pms_rating ?? null,
      remarks: submission?.hr_pms_remarks ?? null,
      evidenceUrls: buildEvidenceUrls(submission?.hr_pms_evidence_urls, submission?.hr_pms_evidence_url),
      achievedValue: submission?.hr_pms_achieved_value ?? null,
    },
    auditor: {
      icon: Shield,
      iconColor: 'purple',
      title: 'Auditor',
      score: submission?.auditor_score ?? null,
      rating: submission?.auditor_rating ?? null,
      remarks: submission?.auditor_remarks ?? null,
      evidenceUrls: buildEvidenceUrls(submission?.auditor_evidence_urls, submission?.auditor_evidence_url),
      achievedValue: submission?.auditor_achieved_value ?? null,
    },
    management: {
      icon: Briefcase,
      iconColor: 'emerald',
      title: 'Management',
      score: submission?.management_score ?? null,
      rating: submission?.management_rating ?? null,
      remarks: submission?.management_remarks ?? null,
      evidenceUrls: buildEvidenceUrls(submission?.management_evidence_urls, submission?.management_evidence_url),
      achievedValue: submission?.management_achieved_value ?? null,
    },
  };

  const stageCount = visibleStages.length;
  const gridCols = stageCount <= 4 ? 'grid-cols-2 lg:grid-cols-4' : stageCount <= 6 ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4';

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <History className="h-4 w-4" />
          Review Journey
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Auto-Advance Warning Banner */}
        {(submission as any)?.auto_advance_reason && (
          <Alert className="border-orange-500/30 bg-orange-500/5">
            <AlertTriangle className="h-4 w-4 text-orange-600" />
            <AlertDescription className="text-sm">
              <strong>System Auto-Advanced:</strong> {(submission as any).auto_advance_reason}
            </AlertDescription>
          </Alert>
        )}

        {/* Review Stages Grid */}
        <div className={`grid ${gridCols} gap-2 lg:gap-3`}>
        {visibleStages.map(stage => {
            const data = stageData[stage];
            const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
            // Per-stage N/A: only show N/A if globally marked AND this stage has no score
            const stageIsNA = (globalIsNA && data.score === null && status !== 'pending') || (!globalIsNA && data.score === null && status !== 'pending' && status === 'completed');
            return (
              <ReviewStageCard
                key={stage}
                icon={data.icon}
                iconColor={data.iconColor}
                title={data.title}
                score={data.score}
                rating={data.rating}
                remarks={data.remarks}
                evidenceUrls={data.evidenceUrls}
                status={status}
                isNA={stageIsNA}
                achievedValue={data.achievedValue}
              />
            );
          })}
        </div>

        {/* Query Summary */}
        {(openQueries > 0 || resolvedQueries > 0) && (
          <div className="pt-3 border-t flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm">
              <MessageSquare className="h-4 w-4 text-muted-foreground" />
              <span className="flex items-center gap-1">
                {openQueries > 0 && (
                  <Badge variant="secondary" className="mr-1">
                    {openQueries} open
                  </Badge>
                )}
                {resolvedQueries > 0 && (
                  <Badge variant="outline">
                    {resolvedQueries} resolved
                  </Badge>
                )}
              </span>
            </div>
            {onOpenQueryHistory && (
              <Button variant="ghost" size="sm" onClick={onOpenQueryHistory} className="h-7 text-xs">
                View History
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
