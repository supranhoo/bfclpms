/**
 * Mobile Self-Review KPI Card
 * Touch-friendly card for Self Review page on mobile devices
 */

import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { KPI, ReviewSubmission, KpiStatus } from '@/hooks/useKpis';
import { renderBoldKpiText } from '@/components/ui/FormattedText';
import { cn } from '@/lib/utils';
import { Send, Eye, Clock, Lock, Info } from 'lucide-react';

const statusColors: Record<string, string> = {
  kra_set: 'bg-muted text-muted-foreground',
  self_review: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  manager_check: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  audit: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  management_review: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200',
  approved: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
};

const statusLabels: Record<string, string> = {
  kra_set: 'Pending',
  self_review: 'Submitted',
  manager_check: 'Manager Review',
  audit: 'Audit',
  management_review: 'Mgmt Review',
  approved: 'Approved',
};

const kpiStatusColors: Record<KpiStatus, string> = {
  open: 'bg-muted text-muted-foreground',
  submitted: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  approved_by_manager: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  locked: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  sent_back: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
};

const kpiStatusLabels: Record<KpiStatus, string> = {
  open: 'Open',
  submitted: 'Submitted',
  approved_by_manager: 'Approved',
  locked: 'Locked',
  sent_back: 'Sent Back',
};

const scoreColors: Record<number, string> = {
  5: '#3B82F6',
  4: '#10B981',
  3: '#F59E0B',
  2: '#EF4444',
  1: '#DC2626',
  0: '#991B1B',
};

interface MobileSelfReviewCardProps {
  kpi: KPI;
  submission?: ReviewSubmission;
  employee?: { full_name: string | null; employee_code: string | null } | null;
  onSubmit?: () => void;
  onView?: () => void;
  onTimeline?: () => void;
  onShowLogic?: () => void;
  isLocked?: boolean;
  canEdit?: boolean;
  isAdmin?: boolean;
}

export function MobileSelfReviewCard({
  kpi,
  submission,
  employee,
  onSubmit,
  onView,
  onTimeline,
  onShowLogic,
  isLocked,
  canEdit,
  isAdmin,
}: MobileSelfReviewCardProps) {
  const isNaKpi = submission?.is_na || false;
  const kpiStatus = submission?.kpi_status || 'open';

  return (
    <Card className={cn(
      "p-4",
      isLocked && "opacity-75 bg-muted/30",
      isNaKpi && "opacity-60 bg-muted/20"
    )}>
      {/* Row 1: Category + Employee (admin) + Status */}
      <div className="flex items-center justify-between mb-2 gap-2">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <div
            className="w-2.5 h-2.5 rounded-full shrink-0"
            style={{ backgroundColor: kpi.kra_categories?.color || 'hsl(var(--primary))' }}
          />
          <span className="text-xs text-muted-foreground truncate">
            {kpi.kra_categories?.name || 'Uncategorized'}
          </span>
        </div>
        {kpi.status ? (
          <Badge className={cn(statusColors[kpi.status], "text-xs shrink-0")}>
            {statusLabels[kpi.status]}
          </Badge>
        ) : (
          <Badge
            className="text-xs shrink-0 bg-amber-100 text-amber-800 border border-amber-300"
            title="POLICY §106 — kpis.status is NULL."
          >
            Status Missing
          </Badge>
        )}
      </div>

      {/* Row 1.5: Employee info (admin only) */}
      {isAdmin && employee && (
        <div className="text-xs text-muted-foreground mb-2 flex items-center gap-2">
          <span className="font-medium text-foreground">{employee.full_name || '-'}</span>
          {employee.employee_code && (
            <span className="text-muted-foreground">({employee.employee_code})</span>
          )}
        </div>
      )}

      {/* Row 2: KRA/KPI Names - Clickable for logic */}
      <button
        onClick={() => onShowLogic?.()}
        className="text-left w-full mb-3 group"
      >
        <p className="font-medium text-sm line-clamp-1 group-hover:text-primary transition-colors">
          {renderBoldKpiText(kpi.kra_name)}
        </p>
        <p className="text-xs text-muted-foreground line-clamp-2 flex items-center gap-1">
          {renderBoldKpiText(kpi.kpi_name)}
          <Info className="h-3 w-3 opacity-0 group-hover:opacity-100 transition-opacity shrink-0" />
        </p>
      </button>

      {/* Row 3: Metrics */}
      <div className="flex gap-4 text-xs mb-3">
        <div>
          <span className="text-muted-foreground block text-[10px]">Target</span>
          <span className="font-mono font-medium">{kpi.target_value ?? '-'}</span>
          {kpi.uom && <span className="text-muted-foreground ml-0.5 text-[10px]">({kpi.uom})</span>}
        </div>
        <div>
          <span className="text-muted-foreground block text-[10px]">Weight</span>
          <span className="font-medium">{kpi.weightage}%</span>
        </div>
        <div>
          <span className="text-muted-foreground block text-[10px]">Achieved</span>
          {isNaKpi ? (
            <Badge variant="outline" className="h-4 text-[10px] px-1">N/A</Badge>
          ) : submission?.achieved_value !== null && submission?.achieved_value !== undefined ? (
            <span className="font-medium">{submission.achieved_value}</span>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
        <div>
          <span className="text-muted-foreground block text-[10px]">Score</span>
          {isNaKpi ? (
            <Badge variant="outline" className="h-4 text-[10px] px-1">N/A</Badge>
          ) : submission?.self_score !== null && submission?.self_score !== undefined ? (
            <Badge
              style={{ backgroundColor: scoreColors[submission.self_score] || '#991B1B' }}
              className="text-white h-4 text-[10px] px-1.5"
            >
              {submission.self_score}
            </Badge>
          ) : (
            <span className="text-muted-foreground">-</span>
          )}
        </div>
      </div>

      {/* Row 4: KPI Status + Actions */}
      <div className="flex items-center justify-between pt-2 border-t">
        {/* KPI Status Badge */}
        <div className="flex items-center gap-1">
          {isLocked && <Lock className="h-3 w-3 text-muted-foreground" />}
          <Badge variant="outline" className={cn(kpiStatusColors[kpiStatus], "text-[10px] h-5")}>
            {kpiStatusLabels[kpiStatus]}
          </Badge>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-1">
          {/* Submit/Edit button */}
          {canEdit && kpiStatus === 'open' && (
            <Button size="sm" className="h-8 text-xs" onClick={onSubmit}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Submit
            </Button>
          )}
          {canEdit && kpiStatus === 'submitted' && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={onSubmit}>
              <Send className="h-3.5 w-3.5 mr-1" />
              Edit
            </Button>
          )}
          {isLocked && (
            <Badge variant="outline" className="text-muted-foreground text-[10px] h-6">
              <Lock className="h-3 w-3 mr-1" />
              Locked
            </Badge>
          )}
          
          {/* View button */}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onView}>
            <Eye className="h-4 w-4" />
          </Button>
          
          {/* Timeline button */}
          <Button size="sm" variant="ghost" className="h-8 w-8 p-0" onClick={onTimeline} title="View Timeline">
            <Clock className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </Card>
  );
}
