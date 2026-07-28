import React, { useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  ClipboardCheck, 
  User, 
  Search, 
  Shield, 
  Briefcase, 
  CheckCircle, 
  ChevronRight,
  MessageSquare 
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { KPI, KpiQuery } from '@/hooks/useKpis';
import { useIsMobile } from '@/hooks/use-mobile';
import { LucideIcon } from 'lucide-react';

type ReviewStatus =
  | 'kra_set'
  | 'self_review'
  | 'manager_check'
  | 'functional_manager_check'
  | 'skip_level_check'
  | 'hr_pms_review'
  | 'audit'
  | 'management_review'
  | 'approved';

interface WorkflowProgressTrackerProps {
  kpis: KPI[];
  queries?: KpiQuery[];
  activeFilter?: string | null;
  onFilterChange?: (stage: string | null) => void;
  compact?: boolean;
  workflowStages?: string[];
}

interface StageConfig {
  key: ReviewStatus;
  label: string;
  shortLabel: string;
  icon: LucideIcon;
  bgClass: string;
  iconBgClass: string;
  progressColor: string;
}

const stageConfig: StageConfig[] = [
  { 
    key: 'kra_set', label: 'KRA SET', shortLabel: 'KRA',
    icon: ClipboardCheck, 
    bgClass: 'border-gray-300 dark:border-gray-600',
    iconBgClass: 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400',
    progressColor: 'bg-gray-400 dark:bg-gray-500'
  },
  { 
    key: 'self_review', label: 'SELF REVIEW', shortLabel: 'Self',
    icon: User, 
    bgClass: 'border-blue-300 dark:border-blue-700',
    iconBgClass: 'bg-blue-100 dark:bg-blue-900 text-blue-600 dark:text-blue-400',
    progressColor: 'bg-blue-500 dark:bg-blue-400'
  },
  { 
    key: 'manager_check', label: 'MANAGER CHECK', shortLabel: 'Mgr',
    icon: Search, 
    bgClass: 'border-orange-300 dark:border-orange-700',
    iconBgClass: 'bg-orange-100 dark:bg-orange-900 text-orange-600 dark:text-orange-400',
    progressColor: 'bg-orange-500 dark:bg-orange-400'
  },
  // ADR-194 §WF-STAGE-SSOT — Functional Manager (F1) sits between Manager
  // Check and Skip-Level in the canonical pipeline. Omitting it here made
  // F1-workflow KPIs invisible on the dashboard stage strip.
  {
    key: 'functional_manager_check', label: 'FUNCTIONAL MGR', shortLabel: 'Func',
    icon: Briefcase,
    bgClass: 'border-fuchsia-300 dark:border-fuchsia-700',
    iconBgClass: 'bg-fuchsia-100 dark:bg-fuchsia-900 text-fuchsia-600 dark:text-fuchsia-400',
    progressColor: 'bg-fuchsia-500 dark:bg-fuchsia-400'
  },
  { 
    key: 'skip_level_check', label: 'SKIP-LEVEL', shortLabel: 'Skip',
    icon: User, 
    bgClass: 'border-teal-300 dark:border-teal-700',
    iconBgClass: 'bg-teal-100 dark:bg-teal-900 text-teal-600 dark:text-teal-400',
    progressColor: 'bg-teal-500 dark:bg-teal-400'
  },
  { 
    key: 'hr_pms_review', label: 'HR PMS', shortLabel: 'HR',
    icon: ClipboardCheck, 
    bgClass: 'border-rose-300 dark:border-rose-700',
    iconBgClass: 'bg-rose-100 dark:bg-rose-900 text-rose-600 dark:text-rose-400',
    progressColor: 'bg-rose-500 dark:bg-rose-400'
  },
  { 
    key: 'audit', label: 'AUDIT', shortLabel: 'Audit',
    icon: Shield, 
    bgClass: 'border-purple-300 dark:border-purple-700',
    iconBgClass: 'bg-purple-100 dark:bg-purple-900 text-purple-600 dark:text-purple-400',
    progressColor: 'bg-purple-500 dark:bg-purple-400'
  },
  { 
    key: 'management_review', label: 'MANAGEMENT', shortLabel: 'Mgmt',
    icon: Briefcase, 
    bgClass: 'border-emerald-300 dark:border-emerald-700',
    iconBgClass: 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600 dark:text-emerald-400',
    progressColor: 'bg-emerald-500 dark:bg-emerald-400'
  },
  { 
    key: 'approved', label: 'APPROVED', shortLabel: 'Done',
    icon: CheckCircle, 
    bgClass: 'border-green-300 dark:border-green-700',
    iconBgClass: 'bg-green-100 dark:bg-green-900 text-green-600 dark:text-green-400',
    progressColor: 'bg-green-500 dark:bg-green-400'
  },
];

export function WorkflowProgressTracker({ 
  kpis, 
  queries = [], 
  activeFilter,
  onFilterChange,
  compact = false,
  workflowStages
}: WorkflowProgressTrackerProps) {
  const isMobile = useIsMobile();
  
  // Filter stage config based on workflow stages if provided
  const effectiveStageConfig = useMemo(() => {
    if (!workflowStages) return stageConfig;
    return stageConfig.filter(stage => workflowStages.includes(stage.key));
  }, [workflowStages]);
  
  // Calculate counts per status
  const statusCounts = useMemo(() => {
    const counts: Record<ReviewStatus, number> = {
      kra_set: 0,
      self_review: 0,
      manager_check: 0,
      functional_manager_check: 0,
      skip_level_check: 0,
      hr_pms_review: 0,
      audit: 0,
      management_review: 0,
      approved: 0,
    };
    
    kpis.forEach(k => {
      const status = k.status as ReviewStatus;
      if (status && status in counts) {
        counts[status]++;
      }
    });
    
    return counts;
  }, [kpis]);

  // Determine which stages have open queries
  const queriesByStage = useMemo(() => {
    const stageQueries: Record<string, number> = {};
    
    const openQueries = queries.filter(q => q.status === 'open');
    openQueries.forEach(query => {
      const kpi = kpis.find(k => k.id === query.kpi_id);
      if (kpi) {
        const stage = kpi.status || 'kra_set';
        stageQueries[stage] = (stageQueries[stage] || 0) + 1;
      }
    });
    
    return stageQueries;
  }, [queries, kpis]);

  // Total open queries
  const openQueryCount = queries.filter(q => q.status === 'open').length;

  // Calculate completion percentage
  const total = kpis.length;
  const approved = statusCounts.approved;
  const completionPercent = total > 0 ? (approved / total) * 100 : 0;

  if (total === 0) return null;

  const isClickable = !!onFilterChange;

  return (
    <Card className="shadow-sm">
      <CardContent className={cn("py-3 px-4", compact && "py-2 px-3")}>
        {/* Stage Cards Row */}
        <div className={cn(
          "flex gap-2 overflow-x-auto scrollbar-none pb-1 sm:pb-0",
          !isMobile && !compact && (
            effectiveStageConfig.length <= 4 ? "sm:grid sm:grid-cols-4" : effectiveStageConfig.length === 5 ? "sm:grid sm:grid-cols-5" : "sm:grid sm:grid-cols-6"
          ),
          (isMobile || compact) && "flex-nowrap"
        )}>
          {effectiveStageConfig.map((stage, index) => {
            const count = statusCounts[stage.key];
            const hasQuery = (queriesByStage[stage.key] || 0) > 0;
            const queryCount = queriesByStage[stage.key] || 0;
            const isActive = activeFilter === stage.key;
            const Icon = stage.icon;

            return (
              <React.Fragment key={stage.key}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div 
                      className={cn(
                        "bg-card rounded-lg border-2 transition-all relative",
                        stage.bgClass,
                        isClickable && "cursor-pointer hover:shadow-md",
                        isActive && "ring-2 ring-primary ring-offset-2",
                        !isActive && activeFilter && "opacity-60",
                        compact ? "p-2" : "p-3",
                        (isMobile || compact) && "min-w-[90px] min-h-[80px]"
                      )}
                      onClick={() => isClickable && onFilterChange?.(isActive ? null : stage.key)}
                    >
                      {/* Query indicator dot */}
                      {hasQuery && (
                        <span className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-orange-500 border-2 border-background flex items-center justify-center">
                          {queryCount > 1 && (
                            <span className="text-[8px] text-white font-bold">{queryCount}</span>
                          )}
                        </span>
                      )}
                      
                      {/* Top row: Icon + Count */}
                      <div className={cn(
                        "flex items-center justify-between",
                        compact ? "mb-1" : "mb-2"
                      )}>
                        <div className={cn(
                          "rounded-full flex items-center justify-center",
                          stage.iconBgClass,
                          compact ? "h-7 w-7" : "h-9 w-9"
                        )}>
                          <Icon className={compact ? "h-3.5 w-3.5" : "h-5 w-5"} />
                        </div>
                        <span className={cn(
                          "font-bold text-foreground",
                          compact ? "text-xl" : "text-3xl"
                        )}>
                          {count}
                        </span>
                      </div>
                      
                      {/* Stage Label */}
                      <p className={cn(
                        "font-semibold text-muted-foreground uppercase tracking-wide truncate",
                        compact ? "text-[10px]" : "text-xs"
                      )}>
                        {isMobile || compact ? stage.shortLabel : stage.label}
                      </p>
                      
                      {/* Full-width colored accent bar */}
                      <div className={cn(
                        "w-full rounded-full mt-2 overflow-hidden",
                        stage.progressColor,
                        compact ? "h-1" : "h-1.5"
                      )} />
                    </div>
                  </TooltipTrigger>
                  <TooltipContent>
                    <p>{stage.label}: {count} KPIs</p>
                    {hasQuery && <p className="text-orange-500">{queryCount} open {queryCount === 1 ? 'query' : 'queries'}</p>}
                  </TooltipContent>
                </Tooltip>
              </React.Fragment>
            );
          })}
        </div>
        
        {/* Overall Progress Bar */}
        <div className={cn(
          "flex items-center gap-3",
          compact ? "mt-2" : "mt-3"
        )}>
          <Progress value={completionPercent} className="flex-1 h-2" />
          <div className="flex items-center gap-2 shrink-0">
            <span className={cn(
              "text-muted-foreground font-medium",
              compact ? "text-[10px]" : "text-xs"
            )}>
              {completionPercent.toFixed(0)}% Complete
            </span>
            {openQueryCount > 0 && (
              <span className={cn(
                "flex items-center gap-1 text-orange-600 dark:text-orange-400",
                compact ? "text-[10px]" : "text-xs"
              )}>
                <MessageSquare className={compact ? "h-3 w-3" : "h-3.5 w-3.5"} />
                {openQueryCount}
              </span>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
