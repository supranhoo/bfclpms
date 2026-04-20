import { useMemo, useCallback } from 'react';
import { format } from 'date-fns';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Badge } from '@/components/ui/badge';
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
  /**
   * When the system auto-switches the period (e.g. Smart Period Detection in
   * EmployeeSelectorGrid jumps to the most recent period with data), this
   * captures the period the user originally had selected so reviewer
   * scorecards can disclose the switch via a banner. Cleared on any
   * user-initiated change in ReviewPeriodSelectorEnhanced.
   */
  autoSwitchedFrom?: { month: string; year: number };
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

  return (
    <div className={cn('flex items-center gap-2 flex-wrap w-full sm:w-auto', className)}>
      {/* Mode Toggle - Clean buttons */}
      {showModeToggle && (
        <>
          <ToggleGroup
            type="single"
            value={value.mode}
            onValueChange={handleModeChange}
            className="h-8"
          >
            <ToggleGroupItem value="single" size="sm" className="text-xs px-2.5 h-8">
              Month
            </ToggleGroupItem>
            <ToggleGroupItem value="ytd" size="sm" className="text-xs px-2.5 h-8">
              YTD
            </ToggleGroupItem>
            <ToggleGroupItem value="qtd" size="sm" className="text-xs px-2.5 h-8">
              QTD
            </ToggleGroupItem>
            <ToggleGroupItem value="custom" size="sm" className="text-xs px-2.5 h-8">
              Custom
            </ToggleGroupItem>
          </ToggleGroup>
          
          {/* Divider */}
          <div className="h-6 w-px bg-border hidden sm:block" />
        </>
      )}
      
      {/* Custom Mode: From selectors */}
      {value.mode === 'custom' && (
        <div className="flex items-center gap-1.5">
          <Select 
            value={value.customStartMonth || value.selectedMonth} 
            onValueChange={handleCustomStartMonthChange}
          >
            <SelectTrigger className="w-[100px] h-8 text-xs">
              <SelectValue placeholder="From" />
            </SelectTrigger>
            <SelectContent>
              {MONTHS.map(month => (
                <SelectItem key={month} value={month} className="text-xs">
                  {month.substring(0, 3)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select 
            value={(value.customStartYear || value.selectedYear).toString()} 
            onValueChange={(v) => handleCustomStartYearChange(parseInt(v))}
          >
            <SelectTrigger className="w-[70px] h-8 text-xs">
              <SelectValue placeholder="Year" />
            </SelectTrigger>
            <SelectContent>
              {years.map(year => (
                <SelectItem key={year} value={year.toString()} className="text-xs">
                  {year}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-muted-foreground text-xs">→</span>
        </div>
      )}
      
      {/* Main month/year selectors */}
      <div className="flex items-center gap-1.5">
        <Select value={value.selectedMonth} onValueChange={handleMonthChange}>
          <SelectTrigger className="w-[100px] h-8 text-xs">
            <SelectValue placeholder="Month" />
          </SelectTrigger>
          <SelectContent>
            {MONTHS.map(month => (
              <SelectItem key={month} value={month} className="text-xs">
                {month.substring(0, 3)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select 
          value={value.selectedYear.toString()} 
          onValueChange={(v) => handleYearChange(parseInt(v))}
        >
          <SelectTrigger className="w-[70px] h-8 text-xs">
            <SelectValue placeholder="Year" />
          </SelectTrigger>
          <SelectContent>
            {years.map(year => (
              <SelectItem key={year} value={year.toString()} className="text-xs">
                {year}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Inline period count badge for cumulative modes */}
      {value.mode !== 'single' && (
        <Badge variant="secondary" className="text-xs h-6 px-2">
          {value.periodRanges.length} {value.periodRanges.length === 1 ? 'month' : 'months'}
        </Badge>
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
