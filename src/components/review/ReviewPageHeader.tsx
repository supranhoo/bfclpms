/**
 * Shared header component for review pages
 */

import { LucideIcon } from 'lucide-react';
import { ReviewPeriodSelector } from '@/components/ui/ReviewPeriodSelector';

interface ReviewPageHeaderProps {
  title: string;
  description: string;
  icon: LucideIcon;
  iconGradient: string;
  selectedPeriod: string;
  selectedYear: number;
  onPeriodChange: (period: string) => void;
  onYearChange: (year: number) => void;
}

export function ReviewPageHeader({
  title,
  description,
  icon: Icon,
  iconGradient,
  selectedPeriod,
  selectedYear,
  onPeriodChange,
  onYearChange,
}: ReviewPageHeaderProps) {
  return (
    <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
      <div className="flex items-center gap-4">
        <div className={`h-10 w-10 sm:h-12 sm:w-12 rounded-xl ${iconGradient} flex items-center justify-center shadow-lg shrink-0`}>
          <Icon className="h-5 w-5 sm:h-6 sm:w-6 text-white" />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">{title}</h1>
          <p className="text-sm sm:text-base text-muted-foreground">{description}</p>
        </div>
      </div>
      <ReviewPeriodSelector
        selectedPeriod={selectedPeriod}
        selectedYear={selectedYear}
        onPeriodChange={onPeriodChange}
        onYearChange={onYearChange}
      />
    </div>
  );
}
