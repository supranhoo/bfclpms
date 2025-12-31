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
        <div className={`h-12 w-12 rounded-xl ${iconGradient} flex items-center justify-center shadow-lg`}>
          <Icon className="h-6 w-6 text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-bold text-foreground">{title}</h1>
          <p className="text-muted-foreground">{description}</p>
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
