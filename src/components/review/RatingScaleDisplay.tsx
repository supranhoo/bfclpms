import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { KPI } from '@/hooks/useKpis';
import { Info } from 'lucide-react';

interface RatingScaleDisplayProps {
  kpi: KPI | null;
  compact?: boolean;
}

interface RatingRowProps {
  label: string;
  value: string;
  colorClass: string;
  tooltipContent: string;
  compact?: boolean;
}

function RatingRow({ label, value, colorClass, tooltipContent, compact }: RatingRowProps) {
  return (
    <TooltipProvider delayDuration={100}>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={`flex ${compact ? 'gap-1' : 'justify-between'} cursor-pointer hover:bg-muted/50 rounded px-1 -mx-1 transition-colors`}>
            <span className={`${colorClass} font-medium ${compact ? 'w-6' : ''} flex items-center gap-0.5`}>
              {label}:
              <Info className="h-3 w-3 opacity-50" />
            </span>
            <span className={`text-muted-foreground truncate ${compact ? '' : 'ml-2'}`}>{value}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-xs">
          <div className="space-y-1">
            <p className="font-medium">{label} Calculation Logic</p>
            <p className="text-xs text-muted-foreground">{tooltipContent}</p>
          </div>
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
    R5: { score: 5, level: 'Exceptional (Blue)' },
    R4: { score: 4, level: 'Exceeds Expectations (Green)' },
    R3: { score: 3, level: 'Meets Expectations (Yellow)' },
    R2: { score: 2, level: 'Below Expectations (Orange)' },
    R1: { score: 1, level: 'Needs Improvement (Red)' },
  };

  const { score, level } = ratingLabels[rating] || { score: 0, level: 'Unknown' };
  
  if (isAbsoluteMode) {
    return `Score: ${score} | ${level}\nThreshold: Achieved value ${isHigherBetter ? '≥' : '≤'} ${threshold}\nMode: Absolute (Target = 0)`;
  }
  
  return `Score: ${score} | ${level}\nThreshold: ${threshold} of target (${target})\nMode: ${isHigherBetter ? 'Higher is Better' : 'Lower is Better'}`;
}

export function RatingScaleDisplay({ kpi, compact = false }: RatingScaleDisplayProps) {
  if (!kpi || (!kpi.r5 && !kpi.r4 && !kpi.r3 && !kpi.r2 && !kpi.r1)) {
    return null;
  }

  const ratings = [
    { key: 'r5', label: 'R5', value: kpi.r5, colorClass: 'text-blue-600' },
    { key: 'r4', label: 'R4', value: kpi.r4, colorClass: 'text-green-600' },
    { key: 'r3', label: 'R3', value: kpi.r3, colorClass: 'text-yellow-600' },
    { key: 'r2', label: 'R2', value: kpi.r2, colorClass: 'text-orange-600' },
    { key: 'r1', label: 'R1', value: kpi.r1, colorClass: 'text-red-600' },
  ].filter(r => r.value);

  if (compact) {
    return (
      <div className="p-2 border rounded-lg space-y-1">
        <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
          Rating Scale
          <span className="text-[10px] opacity-60">(click for details)</span>
        </Label>
        <div className="space-y-0.5 text-xs">
          {ratings.map(r => (
            <RatingRow
              key={r.key}
              label={r.label}
              value={r.value!}
              colorClass={r.colorClass}
              tooltipContent={getCalculationLogic(kpi, r.label, r.value!)}
              compact
            />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="p-3 border rounded-lg space-y-1.5">
      <Label className="text-xs font-medium text-muted-foreground flex items-center gap-1">
        Rating Scale (R1-R5)
        <span className="text-[10px] opacity-60">(click for details)</span>
      </Label>
      <div className="space-y-1 text-xs">
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
  );
}
