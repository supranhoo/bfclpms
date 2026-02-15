import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReviewStageCard, StageStatus } from './ReviewStageCard';
import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { User, Briefcase, Shield, MessageSquare, History, UserCheck, ClipboardCheck } from 'lucide-react';
import { getVisibleJourneyStages, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';

type ViewLevel = 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms';
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

  const openQueries = queries.filter(q => q.status === 'open').length;
  const resolvedQueries = queries.filter(q => q.status === 'resolved').length;

  const stageData: Record<JourneyStage, {
    icon: typeof User;
    iconColor: 'blue' | 'amber' | 'purple' | 'emerald' | 'teal' | 'rose';
    title: string;
    score: number | null;
    rating: any;
    remarks: string | null;
    evidenceUrl: string | null;
    achievedValue: number | null;
  }> = {
    self: {
      icon: User,
      iconColor: 'blue',
      title: 'Self',
      score: submission?.self_score ?? null,
      rating: submission?.self_rating ?? null,
      remarks: submission?.self_remarks ?? null,
      evidenceUrl: submission?.self_evidence_url ?? null,
      achievedValue: submission?.achieved_value ?? null,
    },
    manager: {
      icon: Briefcase,
      iconColor: 'amber',
      title: 'Manager',
      score: submission?.manager_score ?? null,
      rating: submission?.manager_rating ?? null,
      remarks: submission?.manager_remarks ?? null,
      evidenceUrl: submission?.manager_evidence_url ?? null,
      achievedValue: submission?.manager_achieved_value ?? null,
    },
    skip_level: {
      icon: UserCheck,
      iconColor: 'teal',
      title: 'Skip-Level',
      score: (submission as any)?.skip_level_score ?? null,
      rating: (submission as any)?.skip_level_rating ?? null,
      remarks: (submission as any)?.skip_level_remarks ?? null,
      evidenceUrl: (submission as any)?.skip_level_evidence_url ?? null,
      achievedValue: (submission as any)?.skip_level_achieved_value ?? null,
    },
    hr_pms: {
      icon: ClipboardCheck,
      iconColor: 'rose',
      title: 'HR PMS',
      score: (submission as any)?.hr_pms_score ?? null,
      rating: (submission as any)?.hr_pms_rating ?? null,
      remarks: (submission as any)?.hr_pms_remarks ?? null,
      evidenceUrl: (submission as any)?.hr_pms_evidence_url ?? null,
      achievedValue: (submission as any)?.hr_pms_achieved_value ?? null,
    },
    auditor: {
      icon: Shield,
      iconColor: 'purple',
      title: 'Auditor',
      score: submission?.auditor_score ?? null,
      rating: submission?.auditor_rating ?? null,
      remarks: submission?.auditor_remarks ?? null,
      evidenceUrl: submission?.auditor_evidence_url ?? null,
      achievedValue: submission?.auditor_achieved_value ?? null,
    },
    management: {
      icon: Briefcase,
      iconColor: 'emerald',
      title: 'Management',
      score: submission?.management_score ?? null,
      rating: submission?.management_rating ?? null,
      remarks: submission?.management_remarks ?? null,
      evidenceUrl: submission?.management_evidence_url ?? null,
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
        {/* Review Stages Grid */}
        <div className={`grid ${gridCols} gap-2 lg:gap-3`}>
        {visibleStages.map(stage => {
            const data = stageData[stage];
            const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
            // Per-stage N/A: only show N/A if globally marked AND this stage has no score
            const stageIsNA = globalIsNA && data.score === null && status !== 'pending';
            return (
              <ReviewStageCard
                key={stage}
                icon={data.icon}
                iconColor={data.iconColor}
                title={data.title}
                score={data.score}
                rating={data.rating}
                remarks={data.remarks}
                evidenceUrl={data.evidenceUrl}
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
