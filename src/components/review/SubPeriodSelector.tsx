import { useMemo } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Calendar, Clock, CheckCircle2 } from 'lucide-react';
import { 
  FrequencyType, 
  getDailySubPeriods, 
  getWeeklySubPeriods,
  SubPeriodOption 
} from '@/lib/frequencyUtils';
import { SubPeriodSubmission } from '@/hooks/useSubPeriodSubmissions';
import { useDailySubmissionWindow } from '@/hooks/useWorkflowSettings';
import { useWeeklyReviewWindowsResolved } from '@/hooks/useFrequencyConfig';

interface SubPeriodSelectorProps {
  frequency: FrequencyType | string | null;
  reviewMonth: string;
  reviewYear: number;
  selectedSubPeriod: string | null;
  onSubPeriodChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  submissions?: SubPeriodSubmission[];
}

export function SubPeriodSelector({
  frequency,
  reviewMonth,
  reviewYear,
  selectedSubPeriod,
  onSubPeriodChange,
  disabled = false,
  className = '',
  submissions = [],
}: SubPeriodSelectorProps) {
  const currentDate = new Date();
  const windowDays = useDailySubmissionWindow();
  const weeklyWindows = useWeeklyReviewWindowsResolved();
  
  // Create a set of submitted sub-period values for quick lookup
  const submittedValues = useMemo(() => {
    return new Set(submissions.map(s => s.sub_period_value));
  }, [submissions]);
  
  const subPeriodOptions = useMemo((): SubPeriodOption[] => {
    if (!frequency) return [];
    
    let options: SubPeriodOption[];
    switch (frequency) {
      case 'Daily':
        options = getDailySubPeriods(currentDate, reviewMonth, reviewYear, windowDays);
        break;
      case 'Weekly':
        options = getWeeklySubPeriods(currentDate, reviewMonth, reviewYear, weeklyWindows);
        break;
      default:
        options = [];
    }
    
    // Mark options as submitted if they have existing submissions
    return options.map(opt => ({
      ...opt,
      isSubmitted: submittedValues.has(opt.value),
    }));
  }, [frequency, reviewMonth, reviewYear, currentDate.toDateString(), submittedValues, windowDays, weeklyWindows]);

  if (frequency !== 'Daily' && frequency !== 'Weekly') {
    return null;
  }

  const enabledOptions = subPeriodOptions.filter(opt => opt.isEnabled);
  const hasEnabledOptions = enabledOptions.length > 0;

  return (
    <div className={`space-y-2 ${className}`}>
      <div className="flex items-center gap-2">
        {frequency === 'Daily' ? (
          <Calendar className="h-4 w-4 text-muted-foreground" />
        ) : (
          <Clock className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="text-sm font-medium">
          Select {frequency === 'Daily' ? 'Date' : 'Week'}
        </span>
        <Badge variant="secondary" className="text-xs">
          {frequency}
        </Badge>
      </div>
      
      <Select 
        value={selectedSubPeriod || ''} 
        onValueChange={onSubPeriodChange}
        disabled={disabled || !hasEnabledOptions}
      >
        <SelectTrigger className="w-full">
          <SelectValue placeholder={
            hasEnabledOptions 
              ? `Select ${frequency === 'Daily' ? 'date' : 'week'}...` 
              : 'No available periods'
          } />
        </SelectTrigger>
        <SelectContent>
          {subPeriodOptions.map((option) => (
            <SelectItem 
              key={option.value} 
              value={option.value}
              disabled={!option.isEnabled}
              className={!option.isEnabled ? 'opacity-50' : ''}
            >
              <div className="flex items-center gap-2">
                <span>{option.label}</span>
                {option.isSubmitted && (
                  <CheckCircle2 className="h-3 w-3 text-green-600" />
                )}
                {!option.isEnabled && (
                  <Badge variant="outline" className="text-xs">
                    Closed
                  </Badge>
                )}
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      
      {!hasEnabledOptions && (
        <p className="text-xs text-muted-foreground">
          {frequency === 'Daily' 
            ? 'No dates available for submission in this review period.'
            : 'No weeks are currently open for review.'}
        </p>
      )}
    </div>
  );
}
