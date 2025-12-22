import { useMemo } from 'react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from 'lucide-react';

const months = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface ReviewPeriodSelectorProps {
  selectedPeriod: string;
  selectedYear: number;
  onPeriodChange: (period: string) => void;
  onYearChange: (year: number) => void;
  className?: string;
}

export function ReviewPeriodSelector({
  selectedPeriod,
  selectedYear,
  onPeriodChange,
  onYearChange,
  className = '',
}: ReviewPeriodSelectorProps) {
  const currentYear = new Date().getFullYear();
  const currentMonth = format(new Date(), 'MMMM');
  
  // Generate years: current year and 2 years back
  const years = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2];
  }, [currentYear]);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <Calendar className="h-4 w-4 text-muted-foreground" />
      <span className="text-sm font-medium text-muted-foreground">Review Period:</span>
      <Select value={selectedPeriod} onValueChange={onPeriodChange}>
        <SelectTrigger className="w-[140px]">
          <SelectValue placeholder="Select month" />
        </SelectTrigger>
        <SelectContent>
          {months.map(month => (
            <SelectItem key={month} value={month}>
              {month}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Select value={selectedYear.toString()} onValueChange={(v) => onYearChange(parseInt(v))}>
        <SelectTrigger className="w-[100px]">
          <SelectValue placeholder="Year" />
        </SelectTrigger>
        <SelectContent>
          {years.map(year => (
            <SelectItem key={year} value={year.toString()}>
              {year}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function useReviewPeriodDefaults() {
  const currentMonth = format(new Date(), 'MMMM');
  const currentYear = new Date().getFullYear();
  return { defaultPeriod: currentMonth, defaultYear: currentYear };
}
