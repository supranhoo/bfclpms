import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ReviewStageCard, StageStatus } from './ReviewStageCard';
import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { User, Briefcase, Shield, MessageSquare, History } from 'lucide-react';

type ViewLevel = 'employee' | 'manager' | 'auditor' | 'management';

interface KpiJourneySectionProps {
  kpi: KPI;
  submission: ReviewSubmission | null;
  queries?: KpiQuery[];
  viewLevel: ViewLevel;
  onOpenQueryHistory?: () => void;
}

// Determine the status of each review stage based on KPI status and view level
function getStageStatus(
  stage: 'self' | 'manager' | 'auditor' | 'management',
  kpiStatus: string,
  viewLevel: ViewLevel
): StageStatus {
  const statusOrder = ['kra_set', 'self_review', 'manager_check', 'audit', 'management_review', 'approved'];
  const stageToStatus: Record<string, string[]> = {
    self: ['self_review', 'manager_check', 'audit', 'management_review', 'approved'],
    manager: ['manager_check', 'audit', 'management_review', 'approved'],
    auditor: ['audit', 'management_review', 'approved'],
    management: ['management_review', 'approved'],
  };

  const currentIndex = statusOrder.indexOf(kpiStatus);
  const stageStatuses = stageToStatus[stage];
  const stageStartStatus = stageStatuses[0];
  const stageStartIndex = statusOrder.indexOf(stageStartStatus);

  // Check if stage is completed
  if (statusOrder.indexOf(kpiStatus) > stageStartIndex) {
    return 'completed';
  }

  // Check if this is the current stage
  const isCurrentStage =
    (stage === 'self' && kpiStatus === 'self_review') ||
    (stage === 'manager' && kpiStatus === 'manager_check') ||
    (stage === 'auditor' && kpiStatus === 'audit') ||
    (stage === 'management' && kpiStatus === 'management_review');

  // For the view level, mark their stage as current if it's their turn
  if (
    (viewLevel === 'employee' && stage === 'self' && ['kra_set', 'self_review'].includes(kpiStatus)) ||
    (viewLevel === 'manager' && stage === 'manager' && ['self_review', 'manager_check'].includes(kpiStatus)) ||
    (viewLevel === 'auditor' && stage === 'auditor' && ['manager_check', 'audit'].includes(kpiStatus)) ||
    (viewLevel === 'management' && stage === 'management' && ['audit', 'management_review'].includes(kpiStatus))
  ) {
    return 'current';
  }

  if (isCurrentStage) {
    return 'current';
  }

  return 'pending';
}

// Determine which stages to show based on view level
function getVisibleStages(viewLevel: ViewLevel): ('self' | 'manager' | 'auditor' | 'management')[] {
  switch (viewLevel) {
    case 'employee':
      return ['self'];
    case 'manager':
      return ['self', 'manager'];
    case 'auditor':
      return ['self', 'manager', 'auditor'];
    case 'management':
      return ['self', 'manager', 'auditor', 'management'];
    default:
      return ['self', 'manager', 'auditor', 'management'];
  }
}

export function KpiJourneySection({
  kpi,
  submission,
  queries = [],
  viewLevel,
  onOpenQueryHistory,
}: KpiJourneySectionProps) {
  const kpiStatus = kpi.status || 'kra_set';
  const visibleStages = getVisibleStages(viewLevel);
  const isNA = submission?.is_na || false;

  const openQueries = queries.filter(q => q.status === 'open').length;
  const resolvedQueries = queries.filter(q => q.status === 'resolved').length;

  const stageData = {
    self: {
      icon: User,
      iconColor: 'blue' as const,
      title: 'Self',
      score: submission?.self_score ?? null,
      rating: submission?.self_rating ?? null,
      remarks: submission?.self_remarks ?? null,
      evidenceUrl: submission?.self_evidence_url ?? null,
    },
    manager: {
      icon: Briefcase,
      iconColor: 'amber' as const,
      title: 'Manager',
      score: submission?.manager_score ?? null,
      rating: submission?.manager_rating ?? null,
      remarks: submission?.manager_remarks ?? null,
      evidenceUrl: submission?.manager_evidence_url ?? null,
    },
    auditor: {
      icon: Shield,
      iconColor: 'purple' as const,
      title: 'Auditor',
      score: submission?.auditor_score ?? null,
      rating: submission?.auditor_rating ?? null,
      remarks: submission?.auditor_remarks ?? null,
      evidenceUrl: submission?.auditor_evidence_url ?? null,
    },
    management: {
      icon: Briefcase,
      iconColor: 'emerald' as const,
      title: 'Management',
      score: submission?.management_score ?? null,
      rating: submission?.management_rating ?? null,
      remarks: submission?.management_remarks ?? null,
      evidenceUrl: submission?.management_evidence_url ?? null,
    },
  };

  const gridCols = visibleStages.length === 1 ? 'grid-cols-1' :
                   visibleStages.length === 2 ? 'grid-cols-2' :
                   visibleStages.length === 3 ? 'grid-cols-3' :
                   'grid-cols-4';

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
        <div className={`grid ${gridCols} gap-3`}>
          {visibleStages.map(stage => {
            const data = stageData[stage];
            const status = getStageStatus(stage, kpiStatus, viewLevel);
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
                isNA={isNA}
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
