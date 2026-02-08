import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { TrendDirection } from '@/lib/cumulativeScoring';

interface KpiTrendIndicatorProps {
  trend: TrendDirection;
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}

const sizeClasses = {
  sm: 'h-3 w-3',
  md: 'h-4 w-4',
  lg: 'h-5 w-5',
};

const labelSizeClasses = {
  sm: 'text-xs',
  md: 'text-sm',
  lg: 'text-base',
};

export function KpiTrendIndicator({
  trend,
  showLabel = false,
  size = 'md',
  className,
}: KpiTrendIndicatorProps) {
  const iconSize = sizeClasses[size];
  const labelSize = labelSizeClasses[size];

  if (trend === 'improving') {
    return (
      <div className={cn('flex items-center gap-1 text-green-600 dark:text-green-400', className)}>
        <TrendingUp className={iconSize} />
        {showLabel && <span className={labelSize}>Improving</span>}
      </div>
    );
  }

  if (trend === 'declining') {
    return (
      <div className={cn('flex items-center gap-1 text-red-600 dark:text-red-400', className)}>
        <TrendingDown className={iconSize} />
        {showLabel && <span className={labelSize}>Declining</span>}
      </div>
    );
  }

  return (
    <div className={cn('flex items-center gap-1 text-muted-foreground', className)}>
      <Minus className={iconSize} />
      {showLabel && <span className={labelSize}>Stable</span>}
    </div>
  );
}

/**
 * Simple arrow character trend indicator for tables
 */
export function TrendArrow({ trend }: { trend: TrendDirection }) {
  if (trend === 'improving') {
    return <span className="text-green-600 dark:text-green-400">↗</span>;
  }
  if (trend === 'declining') {
    return <span className="text-red-600 dark:text-red-400">↘</span>;
  }
  return <span className="text-muted-foreground">→</span>;
}
