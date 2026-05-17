import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { KPI } from '@/hooks/useKpis';
import { Info, Target, Scale, Clock, Database } from 'lucide-react';

interface KpiMetricsSectionProps {
  kpi: KPI;
}

interface RatingRowProps {
  label: string;
  value: string;
  colorClass: string;
  tooltipContent: string;
}

function RatingRow({ label, value, colorClass, tooltipContent }: RatingRowProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className="flex items-center gap-1 cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors">
            <span className={`${colorClass} font-medium text-xs`}>{label}:</span>
            <span className="text-muted-foreground text-xs truncate">{value}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <p className="text-xs">{tooltipContent}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

function getCalculationLogic(kpi: KPI, rating: string, threshold: string): string {
  const target = kpi.target_value;
  const criteria = kpi.criteria?.toLowerCase() || '';
  const isHigherBetter = criteria.includes('higher') || criteria.includes('more');
  const isAbsoluteMode = target === 0 || target === null;

  const ratingLabels: Record<string, { score: number; level: string }> = {
    R5: { score: 5, level: 'Exceptional' },
    R4: { score: 4, level: 'Exceeds Expectations' },
    R3: { score: 3, level: 'Meets Expectations' },
    R2: { score: 2, level: 'Below Expectations' },
    R1: { score: 1, level: 'Needs Improvement' },
  };

  const { score, level } = ratingLabels[rating] || { score: 0, level: 'Unknown' };

  if (isAbsoluteMode) {
    return `Score: ${score} | ${level} | Threshold: ${threshold}`;
  }

  return `Score: ${score} | ${level} | ${threshold} of target (${target})`;
}

export function KpiMetricsSection({ kpi }: KpiMetricsSectionProps) {
  const target = kpi.target_value;
  const uom = kpi.uom || '';
  const criteria = kpi.criteria || 'Not specified';
  const frequency = kpi.frequency || 'Monthly';
  const source = kpi.source_of_data || 'Manual Entry';
  const weightage = kpi.weightage || 0;

  const ratings = [
    { key: 'r5', label: 'R5', value: kpi.r5, colorClass: 'text-blue-600' },
    { key: 'r4', label: 'R4', value: kpi.r4, colorClass: 'text-green-600' },
    { key: 'r3', label: 'R3', value: kpi.r3, colorClass: 'text-yellow-600' },
    { key: 'r2', label: 'R2', value: kpi.r2, colorClass: 'text-orange-600' },
    { key: 'r1', label: 'R1', value: kpi.r1, colorClass: 'text-red-600' },
  ].filter(r => r.value);

  return (
    <Card>
      <CardHeader className="pb-2 px-3 sm:px-6 pt-3 sm:pt-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <Target className="h-3.5 w-3.5 sm:h-4 sm:w-4" />
          Metrics & Scale
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 sm:space-y-4 px-3 sm:px-6 pb-3 sm:pb-6">
        {/* Metrics Grid - stack label above value to avoid overlap on narrow widths */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-3 gap-y-2 text-xs sm:text-sm">
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3 shrink-0" />
              Target
            </span>
            <span className="font-medium whitespace-nowrap">
              {target !== null && target !== undefined ? `${target} ${uom}` : 'N/A'}
            </span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-muted-foreground flex items-center gap-1">
              <Scale className="h-3 w-3 shrink-0" />
              Criteria
            </span>
            <span className="font-medium text-xs break-words">{criteria}</span>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3 shrink-0" />
              Frequency
            </span>
            <Badge variant="outline" className="text-[10px] sm:text-xs h-5 w-fit">
              {frequency}
            </Badge>
          </div>
          <div className="flex flex-col gap-0.5 min-w-0">
            <span className="text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3 shrink-0" />
              Source
            </span>
            <span className="font-medium text-xs break-words" title={source}>
              {source}
            </span>
          </div>
        </div>

        {/* Rating Scale */}
        {ratings.length > 0 && (
          <div className="pt-2 sm:pt-3 border-t">
            <Label className="text-[10px] sm:text-xs font-medium text-muted-foreground flex items-center gap-1 mb-1.5 sm:mb-2">
              <Info className="h-3 w-3" />
              Rating Scale
            </Label>
            <div className="space-y-0.5 sm:space-y-1">
              {ratings.map(r => (
                <RatingRow
                  key={r.key}
                  label={r.label}
                  value={r.value!}
                  colorClass={r.colorClass}
                  tooltipContent={getCalculationLogic(kpi, r.label, r.value!)}
                />
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
