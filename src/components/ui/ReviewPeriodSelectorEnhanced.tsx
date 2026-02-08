import { useMemo, useState, useCallback } from 'react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Calendar, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export type PeriodMode = 'single' | 'ytd' | 'qtd' | 'custom';

export interface PeriodSelection {
  mode: PeriodMode;
  /** For single mode: the selected month. For YTD/QTD: the end month */
  selectedMonth: string;
  /** Primary year selection */
  selectedYear: number;
  /** All months included in the selection (computed) */
  months: string[];
  /** For custom mode: start month */
  customStartMonth?: string;
  /** For custom mode: start year */
  customStartYear?: number;
  /** For cross-year selections */
  periodRanges: Array<{ month: string; year: number }>;
}

interface ReviewPeriodSelectorEnhancedProps {
  value: PeriodSelection;
  onChange: (selection: PeriodSelection) => void;
  className?: string;
  showModeToggle?: boolean;
}

/**
 * Get the quarter start month for a given month
 */
function getQuarterStart(month: string): string {
  const monthIndex = MONTHS.indexOf(month);
  if (monthIndex < 0) return 'January';
  const quarterStart = Math.floor(monthIndex / 3) * 3;
  return MONTHS[quarterStart];
}

/**
 * Get all months from start to end within a year
 */
function getMonthsInRange(startMonth: string, endMonth: string): string[] {
  const startIndex = MONTHS.indexOf(startMonth);
  const endIndex = MONTHS.indexOf(endMonth);
  if (startIndex < 0 || endIndex < 0 || startIndex > endIndex) return [endMonth];
  return MONTHS.slice(startIndex, endIndex + 1);
}

/**
 * Calculate period ranges for cross-year custom selections
 */
function calculatePeriodRanges(
  mode: PeriodMode,
  selectedMonth: string,
  selectedYear: number,
  customStartMonth?: string,
  customStartYear?: number
): Array<{ month: string; year: number }> {
  const ranges: Array<{ month: string; year: number }> = [];
  
  if (mode === 'single') {
    ranges.push({ month: selectedMonth, year: selectedYear });
  } else if (mode === 'ytd') {
    const endIndex = MONTHS.indexOf(selectedMonth);
    for (let i = 0; i <= endIndex; i++) {
      ranges.push({ month: MONTHS[i], year: selectedYear });
    }
  } else if (mode === 'qtd') {
    const quarterStart = getQuarterStart(selectedMonth);
    const months = getMonthsInRange(quarterStart, selectedMonth);
    months.forEach(month => ranges.push({ month, year: selectedYear }));
  } else if (mode === 'custom' && customStartMonth && customStartYear) {
    // Handle cross-year ranges
    if (customStartYear === selectedYear) {
      const months = getMonthsInRange(customStartMonth, selectedMonth);
      months.forEach(month => ranges.push({ month, year: selectedYear }));
    } else if (customStartYear < selectedYear) {
      // First year: from start month to December
      const startIdx = MONTHS.indexOf(customStartMonth);
      for (let i = startIdx; i < 12; i++) {
        ranges.push({ month: MONTHS[i], year: customStartYear });
      }
      // Middle years (if any)
      for (let year = customStartYear + 1; year < selectedYear; year++) {
        MONTHS.forEach(month => ranges.push({ month, year }));
      }
      // Last year: from January to selected month
      const endIdx = MONTHS.indexOf(selectedMonth);
      for (let i = 0; i <= endIdx; i++) {
        ranges.push({ month: MONTHS[i], year: selectedYear });
      }
    }
  }
  
  return ranges;
}

export function ReviewPeriodSelectorEnhanced({
  value,
  onChange,
  className = '',
  showModeToggle = true,
}: ReviewPeriodSelectorEnhancedProps) {
  const currentYear = new Date().getFullYear();
  
  // Generate years: current year and 2 years back
  const years = useMemo(() => {
    return [currentYear, currentYear - 1, currentYear - 2];
  }, [currentYear]);

  const handleModeChange = useCallback((newMode: string) => {
    if (!newMode) return;
    const mode = newMode as PeriodMode;
    
    let months: string[];
    if (mode === 'single') {
      months = [value.selectedMonth];
    } else if (mode === 'ytd') {
      months = getMonthsInRange('January', value.selectedMonth);
    } else if (mode === 'qtd') {
      const quarterStart = getQuarterStart(value.selectedMonth);
      months = getMonthsInRange(quarterStart, value.selectedMonth);
    } else {
      // Custom defaults to current selection
      months = [value.selectedMonth];
    }
    
    const periodRanges = calculatePeriodRanges(
      mode,
      value.selectedMonth,
      value.selectedYear,
      mode === 'custom' ? value.selectedMonth : undefined,
      mode === 'custom' ? value.selectedYear : undefined
    );
    
    onChange({
      ...value,
      mode,
      months,
      customStartMonth: mode === 'custom' ? value.selectedMonth : undefined,
      customStartYear: mode === 'custom' ? value.selectedYear : undefined,
      periodRanges,
    });
  }, [value, onChange]);

  const handleMonthChange = useCallback((month: string) => {
    let months: string[];
    if (value.mode === 'single') {
      months = [month];
    } else if (value.mode === 'ytd') {
      months = getMonthsInRange('January', month);
    } else if (value.mode === 'qtd') {
      const quarterStart = getQuarterStart(month);
      months = getMonthsInRange(quarterStart, month);
    } else {
      months = getMonthsInRange(value.customStartMonth || month, month);
    }
    
    const periodRanges = calculatePeriodRanges(
      value.mode,
      month,
      value.selectedYear,
      value.customStartMonth,
      value.customStartYear
    );
    
    onChange({
      ...value,
      selectedMonth: month,
      months,
      periodRanges,
    });
  }, [value, onChange]);

  const handleYearChange = useCallback((year: number) => {
    const periodRanges = calculatePeriodRanges(
      value.mode,
      value.selectedMonth,
      year,
      value.customStartMonth,
      value.customStartYear
    );
    
    onChange({
      ...value,
      selectedYear: year,
      periodRanges,
    });
  }, [value, onChange]);

  const handleCustomStartMonthChange = useCallback((month: string) => {
    const months = getMonthsInRange(month, value.selectedMonth);
    const periodRanges = calculatePeriodRanges(
      'custom',
      value.selectedMonth,
      value.selectedYear,
      month,
      value.customStartYear || value.selectedYear
    );
    
    onChange({
      ...value,
      customStartMonth: month,
      months,
      periodRanges,
    });
  }, [value, onChange]);

  const handleCustomStartYearChange = useCallback((year: number) => {
    const periodRanges = calculatePeriodRanges(
      'custom',
      value.selectedMonth,
      value.selectedYear,
      value.customStartMonth,
      year
    );
    
    onChange({
      ...value,
      customStartYear: year,
      periodRanges,
    });
  }, [value, onChange]);

  // Generate period label
  const periodLabel = useMemo(() => {
    if (value.mode === 'single') {
      return `${value.selectedMonth} ${value.selectedYear}`;
    }
    if (value.mode === 'ytd') {
      return `Jan - ${value.selectedMonth.substring(0, 3)} ${value.selectedYear}`;
    }
    if (value.mode === 'qtd') {
      const quarterStart = getQuarterStart(value.selectedMonth);
      return `${quarterStart.substring(0, 3)} - ${value.selectedMonth.substring(0, 3)} ${value.selectedYear}`;
    }
    if (value.mode === 'custom' && value.customStartMonth && value.customStartYear) {
      if (value.customStartYear === value.selectedYear) {
        return `${value.customStartMonth.substring(0, 3)} - ${value.selectedMonth.substring(0, 3)} ${value.selectedYear}`;
      }
      return `${value.customStartMonth.substring(0, 3)} ${value.customStartYear} - ${value.selectedMonth.substring(0, 3)} ${value.selectedYear}`;
    }
    return `${value.selectedMonth} ${value.selectedYear}`;
  }, [value]);

  return (
    <div className={cn('space-y-3', className)}>
      {/* Mode Toggle */}
      {showModeToggle && (
        <div className="flex items-center gap-2 flex-wrap">
          <TrendingUp className="h-4 w-4 text-muted-foreground" />
          <ToggleGroup
            type="single"
            value={value.mode}
            onValueChange={handleModeChange}
            className="justify-start"
          >
            <ToggleGroupItem value="single" size="sm" className="text-xs px-3">
              Month
            </ToggleGroupItem>
            <ToggleGroupItem value="ytd" size="sm" className="text-xs px-3">
              YTD
            </ToggleGroupItem>
            <ToggleGroupItem value="qtd" size="sm" className="text-xs px-3">
              QTD
            </ToggleGroupItem>
            <ToggleGroupItem value="custom" size="sm" className="text-xs px-3">
              Custom
            </ToggleGroupItem>
          </ToggleGroup>
        </div>
      )}

      {/* Date Selectors */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium text-muted-foreground">
            {value.mode === 'custom' ? 'To:' : 'Period:'}
          </span>
        </div>
        
        {/* Custom Mode: From selectors */}
        {value.mode === 'custom' && (
          <>
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">From:</span>
              <Select 
                value={value.customStartMonth || value.selectedMonth} 
                onValueChange={handleCustomStartMonthChange}
              >
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="Month" />
                </SelectTrigger>
                <SelectContent>
                  {MONTHS.map(month => (
                    <SelectItem key={month} value={month}>
                      {month}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select 
                value={(value.customStartYear || value.selectedYear).toString()} 
                onValueChange={(v) => handleCustomStartYearChange(parseInt(v))}
              >
                <SelectTrigger className="w-[90px]">
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
            <span className="text-sm text-muted-foreground">To:</span>
          </>
        )}
        
        {/* Main month/year selectors */}
        <div className="flex gap-2 w-full sm:w-auto">
          <Select value={value.selectedMonth} onValueChange={handleMonthChange}>
            <SelectTrigger className="flex-1 sm:w-[140px]">
              <SelectValue placeholder="Select month" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map(month => (
                <SelectItem key={month} value={month}>
                  {month}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select 
            value={value.selectedYear.toString()} 
            onValueChange={(v) => handleYearChange(parseInt(v))}
          >
            <SelectTrigger className="w-[90px] sm:w-[100px]">
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
      </div>

      {/* Period Summary Badge */}
      {value.mode !== 'single' && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="px-2 py-1 bg-muted rounded-md">
            {periodLabel} ({value.periodRanges.length} {value.periodRanges.length === 1 ? 'month' : 'months'})
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * Hook to get default period selection
 */
export function useDefaultPeriodSelection(): PeriodSelection {
  const currentMonth = format(new Date(), 'MMMM');
  const currentYear = new Date().getFullYear();
  
  return {
    mode: 'single',
    selectedMonth: currentMonth,
    selectedYear: currentYear,
    months: [currentMonth],
    periodRanges: [{ month: currentMonth, year: currentYear }],
  };
}
