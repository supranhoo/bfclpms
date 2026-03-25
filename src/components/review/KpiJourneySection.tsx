import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ReviewStageCard, StageStatus } from './ReviewStageCard';
import { KPI, ReviewSubmission, KpiQuery } from '@/hooks/useKpis';
import { User, Briefcase, Shield, MessageSquare, History, UserCheck, ClipboardCheck, AlertTriangle, Download } from 'lucide-react';
import { getVisibleJourneyStages, DEFAULT_WORKFLOW_STAGES } from '@/lib/workflowEngine';
import { calculateRating, RatingThresholds } from '@/lib/ratingCalculation';
import { UomType } from '@/lib/qualitativeUom';
import { exportReviewTimelinePdf, ReviewTimelinePdfData } from '@/lib/pdfExport';

function useEmployeeProfileForPdf(employeeId: string | undefined) {
  return useQuery({
    queryKey: ['employee-pdf-profile', employeeId],
    queryFn: async () => {
      if (!employeeId) return null;
      const { data: emp } = await supabase
        .from('profiles')
        .select('full_name, employee_code, reporting_manager_id')
        .eq('id', employeeId)
        .single();
      if (!emp) return null;
      let managerName: string | null = null;
      if (emp.reporting_manager_id) {
        const { data: mgr } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('id', emp.reporting_manager_id)
          .single();
        managerName = mgr?.full_name || null;
      }
      return {
        fullName: emp.full_name,
        employeeCode: emp.employee_code,
        managerName,
      };
    },
    enabled: !!employeeId,
    staleTime: 5 * 60 * 1000,
  });
}

type ViewLevel = 'employee' | 'manager' | 'auditor' | 'management' | 'skip_level' | 'hr_pms' | 'admin';
type JourneyStage = 'self' | 'manager' | 'skip_level' | 'hr_pms' | 'auditor' | 'management';

interface KpiJourneySectionProps {
  kpi: KPI;
  submission: ReviewSubmission | null;
  queries?: KpiQuery[];
  viewLevel: ViewLevel;
  onOpenQueryHistory?: () => void;
  workflowStages?: string[];
  employeeName?: string;
  employeeCode?: string;
  reportingManagerName?: string;
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

  if (currentIndex > stageStartIndex) {
    return 'completed';
  }

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
  employeeName,
  employeeCode,
  reportingManagerName,
}: KpiJourneySectionProps) {
  const { data: profileData } = useEmployeeProfileForPdf(kpi.employee_id);
  const effectiveStages = workflowStages || DEFAULT_WORKFLOW_STAGES;
  const kpiStatus = kpi.status || 'kra_set';
  const visibleStages = getVisibleStagesForLevel(viewLevel, effectiveStages);
  const globalIsNA = submission?.is_na || false;

  // Resolve employee details: prefer props, fall back to fetched data
  const resolvedEmployeeName = employeeName || profileData?.fullName || '-';
  const resolvedEmployeeCode = employeeCode || profileData?.employeeCode || '-';
  const resolvedManagerName = reportingManagerName || profileData?.managerName || '-';

  // Recalculate score from achieved value using current KPI thresholds
  // This ensures consistent ratings across all stages regardless of when the score was stored
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
      0,
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

  // Build stage data with recalculated scores from achieved values
  const buildStage = (
    icon: typeof User,
    iconColor: 'blue' | 'amber' | 'purple' | 'emerald' | 'teal' | 'rose',
    title: string,
    storedScore: number | null,
    storedRating: any,
    remarks: string | null,
    evidenceUrls: string[],
    achievedValue: number | null
  ) => {
    const recalc = recalcScore(achievedValue);
    return {
      icon,
      iconColor,
      title,
      score: storedScore ?? recalc?.score ?? null,
      rating: storedRating ?? recalc?.rating ?? null,
      remarks,
      evidenceUrls,
      achievedValue,
    };
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
    self: buildStage(
      User, 'blue', 'Self',
      submission?.self_score ?? null, submission?.self_rating ?? null,
      submission?.self_remarks ?? null,
      buildEvidenceUrls(submission?.self_evidence_urls, submission?.self_evidence_url),
      submission?.achieved_value ?? null
    ),
    manager: buildStage(
      Briefcase, 'amber', 'Manager',
      submission?.manager_score ?? null, submission?.manager_rating ?? null,
      submission?.manager_remarks ?? null,
      buildEvidenceUrls(submission?.manager_evidence_urls, submission?.manager_evidence_url),
      submission?.manager_achieved_value ?? null
    ),
    skip_level: buildStage(
      UserCheck, 'teal', 'Skip-Level',
      submission?.skip_level_score ?? null, submission?.skip_level_rating ?? null,
      submission?.skip_level_remarks ?? null,
      buildEvidenceUrls(submission?.skip_level_evidence_urls, submission?.skip_level_evidence_url),
      submission?.skip_level_achieved_value ?? null
    ),
    hr_pms: buildStage(
      ClipboardCheck, 'rose', 'HR PMS',
      submission?.hr_pms_score ?? null, submission?.hr_pms_rating ?? null,
      submission?.hr_pms_remarks ?? null,
      buildEvidenceUrls(submission?.hr_pms_evidence_urls, submission?.hr_pms_evidence_url),
      submission?.hr_pms_achieved_value ?? null
    ),
    auditor: buildStage(
      Shield, 'purple', 'Auditor',
      submission?.auditor_score ?? null, submission?.auditor_rating ?? null,
      submission?.auditor_remarks ?? null,
      buildEvidenceUrls(submission?.auditor_evidence_urls, submission?.auditor_evidence_url),
      submission?.auditor_achieved_value ?? null
    ),
    management: buildStage(
      Briefcase, 'emerald', 'Management',
      submission?.management_score ?? null, submission?.management_rating ?? null,
      submission?.management_remarks ?? null,
      buildEvidenceUrls(submission?.management_evidence_urls, submission?.management_evidence_url),
      submission?.management_achieved_value ?? null
    ),
  };

  const stageCount = visibleStages.length;
  const gridCols = stageCount <= 4 ? 'grid-cols-2 lg:grid-cols-4' : stageCount <= 6 ? 'grid-cols-2 lg:grid-cols-3 xl:grid-cols-6' : 'grid-cols-2 lg:grid-cols-4';

  const hasAnyData = visibleStages.some(stage => {
    const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
    return status !== 'pending';
  });

  const handleDownloadPdf = () => {
    const pdfData: ReviewTimelinePdfData = {
      employeeName: employeeName || '-',
      employeeCode: employeeCode || '-',
      reportingManagerName: reportingManagerName || '-',
      kpi: {
        kraName: kpi.kra_name || '',
        kpiName: kpi.kpi_name || '',
        category: kpi.kra_categories?.name || '-',
        target: kpi.target_value,
        uom: kpi.uom,
        criteria: kpi.criteria,
        weightage: kpi.weightage,
        frequency: kpi.frequency,
        status: kpi.status || 'kra_set',
      },
      stages: visibleStages.map(stage => {
        const data = stageData[stage];
        const status = getStageStatus(stage, kpiStatus, viewLevel, effectiveStages);
        return {
          title: data.title,
          score: data.score,
          rating: data.rating,
          achievedValue: data.achievedValue,
          remarks: data.remarks,
          status,
        };
      }),
      period: kpi.review_period || '',
      year: String(kpi.review_year || new Date().getFullYear()),
      isNA: globalIsNA,
    };
    exportReviewTimelinePdf(pdfData);
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
            <History className="h-4 w-4" />
            Review Journey
          </CardTitle>
          {hasAnyData && (
            <Button variant="ghost" size="sm" onClick={handleDownloadPdf} className="h-7 text-xs gap-1">
              <Download className="h-3.5 w-3.5" />
              PDF
            </Button>
          )}
        </div>
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
