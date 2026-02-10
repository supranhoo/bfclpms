import { Lock, CalendarClock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { 
  FrequencyType, 
  getActiveMonthForCycle, 
  getCycleLabel,
  isKpiLockedForPeriod 
} from '@/lib/frequencyUtils';
import { useFrequencyConfig } from '@/hooks/useFrequencyConfig';

interface FrequencyLockedOverlayProps {
  frequency: FrequencyType | string | null;
  reviewMonth: string;
  reviewYear: number;
  frequencyCycleStart?: string | null;
  className?: string;
  showBadgeOnly?: boolean;
}

export function FrequencyLockedOverlay({
  frequency,
  reviewMonth,
  reviewYear,
  frequencyCycleStart,
  className = '',
  showBadgeOnly = false,
}: FrequencyLockedOverlayProps) {
  const { config } = useFrequencyConfig(frequency);
  const isLocked = isKpiLockedForPeriod(frequency, reviewMonth, reviewYear, frequencyCycleStart, config);
  const activeMonth = getActiveMonthForCycle(frequency, reviewMonth, reviewYear, frequencyCycleStart, config);
  const cycleLabel = getCycleLabel(frequency, reviewMonth, reviewYear, config);
  
  if (!isLocked) {
    return null;
  }

  if (showBadgeOnly) {
    return (
      <Badge variant="secondary" className="gap-1">
        <Lock className="h-3 w-3" />
        Locked until {activeMonth}
      </Badge>
    );
  }

  return (
    <div className={`absolute inset-0 z-10 flex items-center justify-center bg-background/80 backdrop-blur-sm rounded-md ${className}`}>
      <div className="text-center p-6 max-w-sm">
        <div className="flex justify-center mb-3">
          <div className="p-3 rounded-full bg-muted">
            <Lock className="h-6 w-6 text-muted-foreground" />
          </div>
        </div>
        
        <h4 className="font-semibold text-foreground mb-2">
          {frequency} KPI - Locked Period
        </h4>
        
        <p className="text-sm text-muted-foreground mb-3">
          This KPI is part of a <strong>{cycleLabel}</strong> cycle. 
          Review and scoring will be available in <strong>{activeMonth}</strong>.
        </p>
        
        <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <CalendarClock className="h-4 w-4" />
          <span>Score entered in {activeMonth} will apply to all months in this cycle</span>
        </div>
      </div>
    </div>
  );
}

/**
 * Badge component to show frequency lock status inline
 */
export function FrequencyLockBadge({
  frequency,
  reviewMonth,
  reviewYear,
  frequencyCycleStart,
}: Omit<FrequencyLockedOverlayProps, 'className' | 'showBadgeOnly'>) {
  const { config } = useFrequencyConfig(frequency);
  const isLocked = isKpiLockedForPeriod(frequency, reviewMonth, reviewYear, frequencyCycleStart, config);
  const activeMonth = getActiveMonthForCycle(frequency, reviewMonth, reviewYear, frequencyCycleStart, config);
  
  if (!isLocked) {
    return null;
  }

  return (
    <Badge variant="outline" className="gap-1 text-muted-foreground">
      <Lock className="h-3 w-3" />
      Review in {activeMonth}
    </Badge>
  );
}
