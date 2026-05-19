import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Info, BarChart3, ClipboardEdit, Building2, Users, User, Zap, FastForward } from 'lucide-react';
import { KPI } from '@/hooks/useKpis';
import { getScoreBadgeClass } from '@/lib/reviewConstants';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { getKpiSummaryText } from '@/lib/textFormatting';
import { getQualitativeTargetLabel } from '@/lib/qualitativeUom';
import { AuditKpiAssignPopover } from '@/components/review/AuditKpiAssignPopover';
import type { AuditKpiAssignment } from '@/hooks/useAuditKpiAssignments';

interface MobileKpiCardProps {
  kpi: KPI;
  submission?: {
    final_rating?: string | null;
    self_rating?: string | null;
    final_score?: number | null;
    self_score?: number | null;
    achieved_value?: number | null;
    auto_advance_reason?: string | null;
  };
  statusColors: Record<string, string>;
  statusLabels: Record<string, string>;
  score?: number | null;
  orgKpiValue?: { achieved_value: number | null; data_source: string | null; entered_by_name: string | null } | null;
  dataOwnerNames?: Map<string, string[]>;
  auditAssignment?: AuditKpiAssignment | null;
  isAuditCapable?: boolean;
  onViewLogic: (kpi: KPI) => void;
  onViewTracker: (kpi: KPI) => void;
  onReview?: (kpi: KPI) => void;
}

export function MobileKpiCard({
  kpi,
  submission,
  statusColors,
  statusLabels,
  score: scoreProp,
  orgKpiValue,
  dataOwnerNames,
  auditAssignment,
  isAuditCapable,
  onViewLogic,
  onViewTracker,
  onReview,
}: MobileKpiCardProps) {
  const score = scoreProp ?? submission?.final_score ?? submission?.self_score ?? null;
  const scope = (kpi as any).org_level_scope || 'organization';

  return (
    <Card className="p-4">
      {/* Category pill + status */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div
            className="w-2 h-2 rounded-full flex-shrink-0"
            style={{ backgroundColor: kpi.kra_categories?.color || 'hsl(var(--primary))' }}
          />
          <span className="text-xs text-muted-foreground truncate max-w-[120px]">
            {kpi.kra_categories?.name}
          </span>
          {kpi.is_org_level && (
            scope === 'organization' ? (
              <Building2 className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            ) : scope === 'department' ? (
              <Users className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            ) : (
              <User className="h-3 w-3 text-muted-foreground flex-shrink-0" />
            )
          )}
        </div>
        <div className="flex items-center gap-1">
          <FrequencyBadge frequency={kpi.frequency} size="xs" />
          {kpi.status ? (
            <Badge className={`text-xs ${statusColors[kpi.status]}`}>
              {statusLabels[kpi.status]}
            </Badge>
          ) : (
            <Badge
              className="text-xs bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950 dark:text-amber-200"
              title="POLICY §106 — kpis.status is NULL. Workflow advancement failed silently. Please contact admin."
            >
              Status Missing
            </Badge>
          )}
          {isAuditCapable && (
            <AuditKpiAssignPopover
              kpiId={kpi.id}
              currentAssignment={auditAssignment || null}
            />
          )}
        </div>
      </div>

      {/* KRA/KPI names */}
      <p className="font-medium text-sm mb-1 line-clamp-1 whitespace-pre-wrap">{renderBoldKpiText(kpi.kra_name)}</p>
      <p className="text-xs text-muted-foreground mb-1 line-clamp-2 whitespace-pre-wrap">{renderBoldKpiText(getKpiSummaryText(kpi.kpi_name))}</p>
      {submission?.auto_advance_reason?.startsWith('System-forwarded') ? (
        <FastForward className="h-4 w-4 text-amber-500 dark:text-amber-400 shrink-0 mb-1" />
      ) : submission?.auto_advance_reason ? (
        <Zap className="h-4 w-4 text-orange-500 dark:text-orange-400 shrink-0 mb-1" />
      ) : null}

      {/* Org KPI badges */}
      {kpi.is_org_level && (
        <div className="flex flex-wrap items-center gap-1 mb-3">
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 gap-1">
            {scope === 'organization' ? (
              <Building2 className="h-2.5 w-2.5" />
            ) : scope === 'department' ? (
              <Users className="h-2.5 w-2.5" />
            ) : (
              <User className="h-2.5 w-2.5" />
            )}
            Org KPI — {scope.charAt(0).toUpperCase() + scope.slice(1)}
          </Badge>
          {(() => {
            const ownerKey = `${kpi.category_id}||${kpi.kra_name.toLowerCase()}||${kpi.kpi_name.toLowerCase()}`;
            const owners = dataOwnerNames?.get(ownerKey);
            return owners && owners.length > 0 ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Data Owner: {owners.join(', ')}
              </Badge>
            ) : orgKpiValue?.entered_by_name ? (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                Data Owner: {orgKpiValue.entered_by_name}
              </Badge>
            ) : null;
          })()}
        </div>
      )}

      {!kpi.is_org_level && <div className="mb-3" />}

      {/* Metrics row */}
      <div className="flex items-center justify-between">
        <div className="flex gap-4 text-xs">
          <div>
            <span className="text-muted-foreground block">Target</span>
            <p className="font-mono font-medium">
              {(kpi.uom_type === 'binary' || kpi.uom_type === 'tiered')
                ? (getQualitativeTargetLabel(kpi.uom_type, kpi.qualitative_options as any) ?? '—')
                : (kpi.target_value ?? '-')}
            </p>
          </div>
          <div>
            <span className="text-muted-foreground block">Weight</span>
            <p className="font-medium">{kpi.weightage}%</p>
          </div>
          <div>
            <span className="text-muted-foreground block">Score</span>
            <p className="font-medium">
              {score != null ? (
                <Badge className={`${getScoreBadgeClass(score)} text-xs px-1.5 py-0`}>
                  {score.toFixed(1)}
                </Badge>
              ) : (
                '-'
              )}
            </p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-1">
          {onReview && (
            <Button
              size="icon"
              variant="ghost"
              className="h-8 w-8"
              onClick={() => onReview(kpi)}
              title="Review KPI"
            >
              <ClipboardEdit className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onViewLogic(kpi)}
            title="View Rating Logic"
          >
            <Info className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-8 w-8"
            onClick={() => onViewTracker(kpi)}
            title="View Tracker"
          >
            <BarChart3 className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
