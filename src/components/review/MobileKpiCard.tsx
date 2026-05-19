/**
 * Reusable Mobile KPI Card Component
 * Touch-friendly card layout for KPIs on mobile devices
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { KPI, ReviewSubmission } from '@/hooks/useKpis';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { getKpiSummaryText } from '@/lib/textFormatting';
import { cn } from '@/lib/utils';
import { canReviewKpi } from '@/lib/workflowEngine';
import { 
  Lock, Info, Building2, Users, User, CheckCircle2, Eye, Calendar, 
  Undo2, ChevronDown, ChevronUp, Clock 
} from 'lucide-react';

export type MobileKpiViewType = 'my-kpis' | 'dashboard' | 'team-review' | 'audit' | 'management' | 'skip-level-review' | 'hr-pms-review';

interface MobileKpiCardProps {
  kpi: KPI;
  submission?: ReviewSubmission;
  viewType: MobileKpiViewType;
  workflowStages?: string[];
  onAction?: (kpi: KPI) => void;
  onView?: (kpi: KPI) => void;
  onShowLogic?: (kpi: KPI) => void;
  onSendBack?: (kpi: KPI) => void;
  onToggleExpand?: (kpiId: string) => void;
  isExpanded?: boolean;
  isLocked?: boolean;
  getOrgKpiValue?: (kpi: KPI) => { achieved_value: number | null; data_source: string | null; entered_by_name: string | null } | null;
  sentBackKpiIds?: Set<string>;
  dataOwnerNames?: Map<string, string[]>;
  observationCount?: number;
}

export function MobileKpiCard({
  kpi,
  submission,
  viewType,
  workflowStages,
  onAction,
  onView,
  onShowLogic,
  onSendBack,
  onToggleExpand,
  isExpanded,
  isLocked,
  getOrgKpiValue,
  sentBackKpiIds,
  dataOwnerNames,
  observationCount,
}: MobileKpiCardProps) {
  const isNaKpi = submission?.is_na || false;
  const isDailyKpi = kpi.frequency === 'Daily';
  const orgValue = getOrgKpiValue?.(kpi);
  const scope = kpi.org_level_scope || 'organization';

  // Get appropriate score based on view type
  const getDisplayScore = (): number | null => {
    if (!submission) return null;
    switch (viewType) {
      case 'management':
        return submission.management_score ?? submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? null;
      case 'audit':
        return submission.auditor_score ?? submission.manager_score ?? submission.self_score ?? null;
      case 'team-review':
        return submission.manager_score ?? submission.self_score ?? null;
      default:
        return submission.self_score ?? null;
    }
  };

  const displayScore = getDisplayScore();

  // Determine if we can take action
  const canReview = (): boolean => {
    if (isNaKpi || isLocked) return false;
    if (viewType === 'dashboard') return false;
    return canReviewKpi(kpi.status || 'kra_set', viewType, workflowStages);
  };

  // Get action button content
  const getActionContent = () => {
    if (isLocked && viewType === 'my-kpis') {
      return (
        <Badge variant="outline" className="text-muted-foreground text-xs">
          <Lock className="h-3 w-3 mr-1" />
          Locked
        </Badge>
      );
    }

    if (isNaKpi) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 text-xs">
            N/A
          </Badge>
          {onView && (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onView(kpi)}>
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      );
    }

    const isApproved = kpi.status === 'approved';
    const isForwarded = viewType === 'audit' && (kpi.status === 'management_review' || kpi.status === 'approved');
    const isTeamReviewPastStage = viewType === 'team-review' && 
      ['manager_check', 'audit', 'management_review', 'approved'].includes(kpi.status || '');

    if (canReview()) {
      return (
        <div className="flex items-center gap-2">
          <Button size="sm" className="h-8" onClick={() => onAction?.(kpi)}>
            {viewType === 'audit' && kpi.status === 'audit' ? 'Continue' : 'Review'}
          </Button>
          {(viewType === 'team-review' || viewType === 'audit' || viewType === 'management') && onSendBack && (
            <Button size="sm" variant="outline" className="h-8 px-2" onClick={() => onSendBack(kpi)}>
              <Undo2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      );
    }

    if (isApproved && viewType === 'management') {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs">
            <CheckCircle2 className="h-3 w-3 mr-1" />
            Done
          </Badge>
          {onView && (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onView(kpi)}>
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      );
    }

    if (isForwarded) {
      return (
        <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Fwd
        </Badge>
      );
    }

    // Check if KPI is drafted at management level (score saved but not approved)
    const isMgmtDrafted = (viewType === 'team-review' || viewType === 'skip-level-review' || viewType === 'hr-pms-review') && 
      kpi.status === 'management_review' && 
      submission?.management_score !== null && submission?.management_score !== undefined;

    if (isMgmtDrafted) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 dark:bg-amber-900/20 dark:text-amber-400 border-amber-300 text-xs">
            <Clock className="h-3 w-3 mr-1" />
            Draft (Mgmt)
          </Badge>
          {onView && (
            <Button size="sm" variant="ghost" className="h-8 px-2" onClick={() => onView(kpi)}>
              <Eye className="h-4 w-4" />
            </Button>
          )}
        </div>
      );
    }

    if (isTeamReviewPastStage) {
      return (
        <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-xs">
          <CheckCircle2 className="h-3 w-3 mr-1" />
          Done
        </Badge>
      );
    }

    if (onView) {
      return (
        <Button size="sm" variant="outline" className="h-8" onClick={() => onView(kpi)}>
          <Eye className="h-4 w-4 mr-1" />
          View
        </Button>
      );
    }

    return null;
  };

  return (
    <Card className={cn(
      "p-3",
      isLocked && "opacity-60",
      isNaKpi && "opacity-60 bg-muted/20"
    )}>
      {/* Row 1: Category + Status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: kpi.kra_categories?.color || 'hsl(var(--primary))' }}
          />
          <span className="text-[10px] text-muted-foreground truncate">
            {kpi.kra_categories?.name || 'Uncategorized'}
          </span>
          {kpi.is_org_level && (
            <Tooltip>
              <TooltipTrigger>
                {scope === 'organization' ? (
                  <Building2 className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : scope === 'department' ? (
                  <Users className="h-3 w-3 text-muted-foreground shrink-0" />
                ) : (
                  <User className="h-3 w-3 text-muted-foreground shrink-0" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>Org-level ({scope})</p>
              </TooltipContent>
            </Tooltip>
          )}
          <FrequencyBadge frequency={kpi.frequency} size="xs" />
          {sentBackKpiIds?.has(kpi.id) && kpi.status === 'audit' && (
            <Badge variant="outline" className="text-[10px] px-1 py-0 h-4 shrink-0 border-amber-300 bg-amber-50 text-amber-700 dark:border-amber-600 dark:bg-amber-900/20 dark:text-amber-400 gap-0.5">
              <Undo2 className="h-2.5 w-2.5" />
              Sent Back
            </Badge>
          )}
        </div>
        {kpi.status ? (
          <Badge className={cn(statusColors[kpi.status], "text-[10px] shrink-0 ml-1.5")}>
            {statusLabels[kpi.status]}
          </Badge>
        ) : (
          <Badge
            className="text-[10px] shrink-0 ml-1.5 bg-amber-100 text-amber-800 border border-amber-300"
            title="POLICY §106 — kpis.status is NULL."
          >
            Status Missing
          </Badge>
        )}
        {(observationCount ?? 0) > 0 && (
          <span className="ml-1 inline-flex items-center gap-0.5 text-[10px] text-amber-600 dark:text-amber-400 shrink-0">
            <Eye className="h-3 w-3" />{observationCount}
          </span>
        )}
      </div>

      {/* Org KPI Badge Row */}
      {kpi.is_org_level && (
        <div className="flex flex-wrap items-center gap-1 mb-1.5">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-0.5">
            {scope === 'organization' ? (
              <Building2 className="h-2.5 w-2.5" />
            ) : scope === 'department' ? (
              <Users className="h-2.5 w-2.5" />
            ) : (
              <User className="h-2.5 w-2.5" />
            )}
            Org KPI
          </Badge>
          {(() => {
            const ownerKey = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}`;
            const owners = dataOwnerNames?.get(ownerKey);
            return owners && owners.length > 0 ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Data Owner: {owners.join(', ')}
              </Badge>
            ) : orgValue?.entered_by_name ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Data Owner: {orgValue.entered_by_name}
              </Badge>
            ) : null;
          })()}
        </div>
      )}

      {/* Row 2: KRA/KPI Names - Clickable for logic */}
      <button
        onClick={() => onShowLogic?.(kpi)}
        className="text-left w-full mb-2 group"
      >
        <p className="font-medium text-xs line-clamp-1 whitespace-pre-wrap group-hover:text-primary transition-colors">
          {renderBoldKpiText(kpi.kra_name)}
        </p>
        <div className="flex items-start gap-1">
          <p className="text-[10px] text-muted-foreground line-clamp-2 whitespace-pre-wrap flex-1 min-w-0">
            {renderBoldKpiText(getKpiSummaryText(kpi.kpi_name))}
          </p>
          <Info className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5" />
        </div>
      </button>

      {/* Row 3: Metrics + Actions */}
      <div className="flex items-center justify-between">
        <div className="flex gap-3 text-[10px]">
          <div>
            <span className="text-muted-foreground block text-[9px]">Target</span>
            <span className="font-mono font-medium text-xs">{kpi.target_value ?? '-'}</span>
            {kpi.uom && <span className="text-muted-foreground ml-0.5 text-[9px]">{kpi.uom}</span>}
          </div>
          <div>
            <span className="text-muted-foreground block text-[9px]">Weight</span>
            <span className="font-medium text-xs">{kpi.weightage}%</span>
          </div>
          {displayScore !== null && !isNaKpi && (
            <div>
              <span className="text-muted-foreground block text-[9px]">Score</span>
              <span className="font-medium text-xs">{displayScore}</span>
            </div>
          )}
        </div>

        <div className="flex items-center gap-1">
          {getActionContent()}
          
          {isDailyKpi && !isNaKpi && onToggleExpand && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleExpand(kpi.id)}
              className="h-8 px-2"
            >
              <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
              {isExpanded ? (
                <ChevronUp className="h-3 w-3 ml-0.5" />
              ) : (
                <ChevronDown className="h-3 w-3 ml-0.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
