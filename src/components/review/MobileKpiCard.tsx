/**
 * Reusable Mobile / Tablet KPI Card Component
 * Touch-friendly card layout for KPIs on small and medium viewports.
 *
 * ADR-355 — every read-only state keeps a labelled, touch-sized View control.
 * ADR-356 — presentation pass: one status badge per card (header only),
 * readable type scale, aligned metric grid, semantic colour tokens,
 * >=44px hit areas on every interactive element.
 * ADR-357 — declutter pass: KRA eyebrow suppressed when it duplicates the KPI
 * title, org-scope tooltip icon removed from the header (redundant with the
 * org info line), Org KPI badge row merged into a single muted text line.
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPI, ReviewSubmission } from '@/hooks/useKpis';
import { statusColors, statusLabels } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { KpiTitle } from '@/components/kpi/KpiText';
import { cn } from '@/lib/utils';
import { canReviewKpi } from '@/lib/workflowEngine';
import { FrequencyBadge } from '@/components/review/FrequencyBadge';
import {
  Lock, Info, Building2, Users, User, Eye, Calendar,
  Undo2, ChevronDown, ChevronUp, MessageSquare,
} from 'lucide-react';

export type MobileKpiViewType = 'my-kpis' | 'dashboard' | 'team-review' | 'functional-manager-review' | 'audit' | 'management' | 'skip-level-review' | 'hr-pms-review';

/** Rating scale used across every review surface (see ratingOptions). */
const MAX_RATING_SCORE = 5;

/** Unit strings that describe the value type rather than a printable unit. */
const NON_PRINTABLE_UOMS = new Set(['number', 'date', 'count', 'nos', 'no']);

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

  const viewButton = (label = 'View') =>
    onView ? (
      <Button
        size="sm"
        variant="outline"
        className="min-h-[44px] px-4"
        aria-label={`${label} KPI details`}
        onClick={() => onView(kpi)}
      >
        <Eye className="h-4 w-4 mr-1.5" />
        {label}
      </Button>
    ) : null;

  /**
   * Action row holds controls only — state is communicated once, by the
   * header badge (ADR-356). No duplicate Fwd / Done pills here.
   */
  const getActionContent = () => {
    if (isLocked && viewType === 'my-kpis') {
      return viewButton();
    }

    if (isNaKpi) {
      return viewButton();
    }

    const isApproved = kpi.status === 'approved';
    const isForwarded = viewType === 'audit' && (kpi.status === 'management_review' || kpi.status === 'approved');
    const isTeamReviewPastStage = viewType === 'team-review' &&
      ['manager_check', 'audit', 'management_review', 'approved'].includes(kpi.status || '');

    if (canReview()) {
      return (
        <div className="flex items-center gap-2">
          <Button size="sm" className="min-h-[44px] px-4" onClick={() => onAction?.(kpi)}>
            {viewType === 'audit' && kpi.status === 'audit' ? 'Continue' : 'Review'}
          </Button>
          {(viewType === 'team-review' || viewType === 'audit' || viewType === 'management') && onSendBack && (
            <Button
              size="sm"
              variant="outline"
              className="min-h-[44px] min-w-[44px] px-3"
              aria-label="Send back for rework"
              onClick={() => onSendBack(kpi)}
            >
              <Undo2 className="h-4 w-4" />
            </Button>
          )}
        </div>
      );
    }

    if (isApproved && viewType === 'management') {
      return viewButton();
    }

    if (isForwarded) {
      // ADR-355 — a forwarded KPI must stay reopenable read-only.
      return onView ? (
        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px] px-4"
          aria-label="View forwarded KPI details"
          onClick={() => onView(kpi)}
        >
          <Eye className="h-4 w-4 mr-1.5" />
          View
        </Button>
      ) : null;
    }

    if (isTeamReviewPastStage) {
      // ADR-355 — reviewed KPIs stay reopenable read-only.
      return onView ? (
        <Button
          size="sm"
          variant="outline"
          className="min-h-[44px] px-4"
          aria-label="View reviewed KPI details"
          onClick={() => onView(kpi)}
        >
          <Eye className="h-4 w-4 mr-1.5" />
          View
        </Button>
      ) : null;
    }

    return viewButton();
  };

  /** Supplementary state that the workflow status badge cannot express. */
  const renderStateBadges = () => {
    const badges: React.ReactNode[] = [];

    if (isNaKpi) {
      badges.push(
        <Badge key="na" variant="warning" className="text-xs">N/A</Badge>
      );
    }
    if (isLocked && viewType === 'my-kpis') {
      badges.push(
        <Badge key="locked" variant="outline" className="text-xs text-muted-foreground">
          <Lock className="h-3 w-3 mr-1" aria-hidden="true" />
          Locked
        </Badge>
      );
    }
    const isMgmtDrafted = (viewType === 'team-review' || viewType === 'skip-level-review' || viewType === 'hr-pms-review') &&
      kpi.status === 'management_review' &&
      submission?.management_score !== null && submission?.management_score !== undefined;
    if (isMgmtDrafted) {
      badges.push(
        <Badge key="draft" variant="warning" className="text-xs">Draft (Mgmt)</Badge>
      );
    }
    return badges;
  };

  const printableUom = kpi.uom && !NON_PRINTABLE_UOMS.has(kpi.uom.trim().toLowerCase())
    ? kpi.uom
    : null;

  return (
    <Card className={cn(
      "p-4 flex flex-col gap-3",
      isLocked && "opacity-60",
      isNaKpi && "opacity-70 bg-muted/20"
    )}>
      {/* Row 1: Category + Status */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-1.5 min-w-0 flex-1 flex-wrap">
          <div
            className="w-2 h-2 rounded-full shrink-0"
            style={{ backgroundColor: kpi.kra_categories?.color || 'hsl(var(--primary))' }}
            aria-hidden="true"
          />
          <span className="text-xs text-muted-foreground truncate max-w-[60%]">
            {kpi.kra_categories?.name || 'Uncategorized'}
          </span>
          {kpi.is_org_level && (
            <Tooltip>
              <TooltipTrigger
                aria-label={`Organisation-level KPI, ${scope} scope`}
                className="inline-flex items-center justify-center h-11 w-8 -my-3 shrink-0"
              >
                {scope === 'organization' ? (
                  <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                ) : scope === 'department' ? (
                  <Users className="h-3.5 w-3.5 text-muted-foreground" />
                ) : (
                  <User className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </TooltipTrigger>
              <TooltipContent>
                <p>Org-level ({scope})</p>
              </TooltipContent>
            </Tooltip>
          )}
          <FrequencyBadge frequency={kpi.frequency} size="xs" />
          {sentBackKpiIds?.has(kpi.id) && kpi.status === 'audit' && (
            <Badge variant="warning" className="text-xs gap-1 shrink-0">
              <Undo2 className="h-3 w-3" aria-hidden="true" />
              Sent Back
            </Badge>
          )}
          {(observationCount ?? 0) > 0 && (
            <span
              className="inline-flex items-center gap-1 text-xs text-muted-foreground shrink-0"
              aria-label={`${observationCount} observations`}
            >
              <MessageSquare className="h-3.5 w-3.5" aria-hidden="true" />
              {observationCount}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0 flex-wrap justify-end">
          {renderStateBadges()}
          {kpi.status ? (
            <Badge className={cn(statusColors[kpi.status], "text-xs")}>
              {statusLabels[kpi.status]}
            </Badge>
          ) : (
            <Badge
              variant="warning"
              className="text-xs"
              title="POLICY §106 — kpis.status is NULL."
            >
              Status Missing
            </Badge>
          )}
        </div>
      </div>

      {/* Org KPI Badge Row */}
      {kpi.is_org_level && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant="secondary" className="text-xs gap-1">
            {scope === 'organization' ? (
              <Building2 className="h-3 w-3" aria-hidden="true" />
            ) : scope === 'department' ? (
              <Users className="h-3 w-3" aria-hidden="true" />
            ) : (
              <User className="h-3 w-3" aria-hidden="true" />
            )}
            Org KPI
          </Badge>
          {(() => {
            const ownerKey = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}`;
            const owners = dataOwnerNames?.get(ownerKey);
            return owners && owners.length > 0 ? (
              <Badge variant="outline" className="text-xs font-normal">
                Data Owner: {owners.join(', ')}
              </Badge>
            ) : orgValue?.entered_by_name ? (
              <Badge variant="outline" className="text-xs font-normal" title="Last person who entered a value for this KPI. Not necessarily the assigned Data Owner.">
                Entered by: {orgValue.entered_by_name}
              </Badge>
            ) : null;
          })()}
        </div>
      )}

      {/* Row 2: KPI title is the primary line; KRA is the eyebrow */}
      <button
        onClick={() => onShowLogic?.(kpi)}
        className="text-left w-full group rounded-md py-1 -my-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label="Show KPI scoring logic"
      >
        <p className="text-xs text-muted-foreground line-clamp-1 whitespace-pre-wrap">
          {renderBoldKpiText(kpi.kra_name)}
        </p>
        <div className="flex items-start gap-1.5">
          <KpiTitle
            kpi={kpi}
            as="p"
            className="text-sm font-medium leading-snug line-clamp-2 flex-1 min-w-0 group-hover:text-primary transition-colors"
          />
          <Info className="h-3.5 w-3.5 opacity-0 group-hover:opacity-100 transition-opacity shrink-0 mt-0.5 text-muted-foreground" />
        </div>
      </button>

      {/* Row 3: Metrics + Actions */}
      <div className="flex items-end justify-between gap-3">
        <dl className="grid grid-cols-3 gap-x-4 flex-1 min-w-0">
          <div className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">Target</dt>
            <dd className="text-sm font-medium tabular-nums truncate">
              {kpi.target_value ?? '—'}
              {printableUom && <span className="text-[11px] text-muted-foreground ml-1">{printableUom}</span>}
            </dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">Weight</dt>
            <dd className="text-sm font-medium tabular-nums">{kpi.weightage}%</dd>
          </div>
          <div className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">Score</dt>
            <dd className="text-sm font-medium tabular-nums">
              {displayScore !== null && !isNaKpi ? (
                <>
                  {displayScore}
                  <span className="text-[11px] text-muted-foreground"> / {MAX_RATING_SCORE}</span>
                </>
              ) : '—'}
            </dd>
          </div>
        </dl>

        <div className="flex items-center gap-2 shrink-0">
          {getActionContent()}

          {isDailyKpi && !isNaKpi && onToggleExpand && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onToggleExpand(kpi.id)}
              className="min-h-[44px] min-w-[44px] px-2"
              aria-label={isExpanded ? 'Collapse daily entries' : 'Expand daily entries'}
              aria-expanded={isExpanded}
            >
              <Calendar className="h-4 w-4 text-muted-foreground" />
              {isExpanded ? (
                <ChevronUp className="h-3.5 w-3.5 ml-0.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5 ml-0.5" />
              )}
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
