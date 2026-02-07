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
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
          <Target className="h-4 w-4" />
          Metrics & Scale
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Metrics Grid - single column on very small screens */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Target className="h-3 w-3" />
              Target
            </span>
            <span className="font-medium">
              {target !== null && target !== undefined ? `${target} ${uom}` : 'N/A'}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Scale className="h-3 w-3" />
              Criteria
            </span>
            <span className="font-medium text-xs">{criteria}</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Clock className="h-3 w-3" />
              Frequency
            </span>
            <Badge variant="outline" className="text-xs">
              {frequency}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground flex items-center gap-1">
              <Database className="h-3 w-3" />
              Source
            </span>
            <span className="font-medium text-xs truncate max-w-[100px]" title={source}>
              {source}
            </span>
          </div>
        </div>

        {/* Rating Scale */}
        {ratings.length > 0 && (
          <div className="pt-3 border-t">
            <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1 mb-2">
              <Info className="h-3 w-3" />
              Rating Scale
            </Label>
            <div className="space-y-1">
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
