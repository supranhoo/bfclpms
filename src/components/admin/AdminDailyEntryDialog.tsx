import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isSameMonth, getDay } from 'date-fns';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, Loader2, ShieldAlert, Lock, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useAdminSubmitSubPeriod } from '@/hooks/useAdminDataEntry';
import { cn } from '@/lib/utils';
import type { KPI } from '@/hooks/useKpis';

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

interface AdminDailyEntryDialogProps {
  isOpen: boolean;
  onClose: () => void;
  kpi: KPI | null;
  employeeId: string;
  employeeName: string;
  employeeCode?: string;
}

interface DaySubmission {
  id: string;
  achieved_value: number | null;
  is_resubmitted: boolean;
  remarks?: string | null;
  sub_period_value: string;
}

export function AdminDailyEntryDialog({
  isOpen,
  onClose,
  kpi,
  employeeId,
  employeeName,
  employeeCode,
}: AdminDailyEntryDialogProps) {
  const submitMutation = useAdminSubmitSubPeriod();
  
  // Period selection
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth());
  
  // Selected day and form state
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [achievedValue, setAchievedValue] = useState<string>('');
  const [remarks, setRemarks] = useState<string>('');
  const [reason, setReason] = useState<string>('');

  // Get month string for queries
  const monthName = MONTH_NAMES[selectedMonth];

  // Fetch existing submissions for the selected month
  const { data: submissions, isLoading: loadingSubmissions, refetch } = useQuery({
    queryKey: ['sub-period-submissions-admin', kpi?.id, monthName, selectedYear],
    queryFn: async () => {
      if (!kpi?.id) return [];
      const { data, error } = await supabase
        .from('sub_period_submissions')
        .select('*')
        .eq('kpi_id', kpi.id)
        .eq('review_month', monthName)
        .eq('review_year', selectedYear)
        .eq('sub_period_type', 'daily');
      if (error) throw error;
      return data as DaySubmission[];
    },
    enabled: !!kpi?.id && isOpen,
  });

  // Build submissions map for quick lookup
  const submissionsMap = useMemo(() => {
    const map = new Map<string, DaySubmission>();
    submissions?.forEach(sub => {
      map.set(sub.sub_period_value, sub);
    });
    return map;
  }, [submissions]);

  // Generate calendar days
  const calendarDays = useMemo(() => {
    const start = startOfMonth(new Date(selectedYear, selectedMonth));
    const end = endOfMonth(new Date(selectedYear, selectedMonth));
    return eachDayOfInterval({ start, end });
  }, [selectedYear, selectedMonth]);

  // Get first day offset for calendar grid
  const firstDayOffset = getDay(calendarDays[0]);

  // Load selected day's data
  useEffect(() => {
    if (!selectedDate) {
      setAchievedValue('');
      setRemarks('');
      return;
    }
    
    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    const submission = submissionsMap.get(dateStr);
    
    if (submission) {
      setAchievedValue(submission.achieved_value?.toString() || '');
      setRemarks(submission.remarks || '');
    } else {
      setAchievedValue('');
      setRemarks('');
    }
  }, [selectedDate, submissionsMap]);

  // Reset form when dialog closes
  useEffect(() => {
    if (!isOpen) {
      setSelectedDate(null);
      setAchievedValue('');
      setRemarks('');
      setReason('');
      // Reset to current month/year
      setSelectedYear(new Date().getFullYear());
      setSelectedMonth(new Date().getMonth());
    }
  }, [isOpen]);

  // Navigate months
  const goToPreviousMonth = () => {
    if (selectedMonth === 0) {
      setSelectedMonth(11);
      setSelectedYear(y => y - 1);
    } else {
      setSelectedMonth(m => m - 1);
    }
    setSelectedDate(null);
  };

  const goToNextMonth = () => {
    if (selectedMonth === 11) {
      setSelectedMonth(0);
      setSelectedYear(y => y + 1);
    } else {
      setSelectedMonth(m => m + 1);
    }
    setSelectedDate(null);
  };

  const handleSubmit = async () => {
    if (!kpi || !selectedDate || !reason.trim()) return;

    const dateStr = format(selectedDate, 'yyyy-MM-dd');
    
    await submitMutation.mutateAsync({
      kpi_id: kpi.id,
      employee_id: employeeId,
      sub_period_type: 'daily',
      sub_period_value: dateStr,
      achieved_value: achievedValue ? parseFloat(achievedValue) : null,
      remarks: remarks || undefined,
      reason: reason.trim(),
      review_month: monthName,
      review_year: selectedYear,
      kpi_name: kpi.kpi_name,
    });

    // Refetch and clear selection
    refetch();
    setSelectedDate(null);
    setAchievedValue('');
    setRemarks('');
    setReason('');
  };

  const isValid = selectedDate && reason.trim().length > 0;
  const selectedDateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : null;
  const selectedSubmission = selectedDateStr ? submissionsMap.get(selectedDateStr) : null;

  // Get value display for calendar cell
  const getValueDisplay = (value: number | null, uomType?: string | null): string => {
    if (value === null) return '';
    
    // Handle binary UOM types
    if (uomType === 'Binary' || uomType === 'Tiered') {
      if (value === 5) return '✓';
      if (value === 0) return '✗';
    }
    
    return value.toString();
  };

  // Render qualitative input based on UOM type
  const renderValueInput = () => {
    const uomType = kpi?.uom_type;
    
    if (uomType === 'binary') {
      return (
        <Select 
          value={achievedValue} 
          onValueChange={setAchievedValue}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="5">Yes (5)</SelectItem>
            <SelectItem value="0">No (0)</SelectItem>
          </SelectContent>
        </Select>
      );
    }
    
    if (uomType === 'tiered' && kpi?.qualitative_options) {
      const options = kpi.qualitative_options as Array<{ label: string; rating: number; definition?: string }>;
      return (
        <Select 
          value={achievedValue} 
          onValueChange={setAchievedValue}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select value" />
          </SelectTrigger>
          <SelectContent>
            {options.map((opt, idx) => (
              <SelectItem key={idx} value={opt.rating.toString()}>
                {opt.label} ({opt.rating})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    }
    
    // Default numeric input
    return (
      <Input
        type="number"
        step="any"
        value={achievedValue}
        onChange={(e) => setAchievedValue(e.target.value)}
        placeholder="Enter value"
      />
    );
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-warning" />
            Admin Daily Entry
          </DialogTitle>
          <DialogDescription>
            {kpi && (
              <div className="space-y-1 mt-2">
                <div className="font-medium text-foreground">{kpi.kpi_name}</div>
                <div className="text-sm">
                  Employee: <span className="font-medium">{employeeName}</span>
                  {employeeCode && <span className="text-muted-foreground"> ({employeeCode})</span>}
                </div>
                <div className="text-sm text-muted-foreground">
                  UOM: {kpi.uom_type || 'Numeric'} · Frequency: {kpi.frequency}
                </div>
              </div>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Month Navigation */}
          <div className="flex items-center justify-between">
            <Button variant="outline" size="icon" onClick={goToPreviousMonth}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="font-medium text-lg">
              {MONTH_NAMES[selectedMonth]} {selectedYear}
            </div>
            <Button variant="outline" size="icon" onClick={goToNextMonth}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>

          {/* Calendar Grid */}
          {loadingSubmissions ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          ) : (
            <div className="border rounded-lg p-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-muted-foreground py-2">
                    {day}
                  </div>
                ))}
              </div>
              
              {/* Calendar days */}
              <div className="grid grid-cols-7 gap-1">
                {/* Empty cells for offset */}
                {Array.from({ length: firstDayOffset }).map((_, i) => (
                  <div key={`empty-${i}`} className="aspect-square" />
                ))}
                
                {/* Day cells */}
                {calendarDays.map(day => {
                  const dateStr = format(day, 'yyyy-MM-dd');
                  const submission = submissionsMap.get(dateStr);
                  const hasValue = submission?.achieved_value !== null && submission?.achieved_value !== undefined;
                  const isLocked = submission?.is_resubmitted;
                  const isSelected = selectedDate && format(selectedDate, 'yyyy-MM-dd') === dateStr;
                  
                  return (
                    <button
                      key={dateStr}
                      type="button"
                      onClick={() => setSelectedDate(day)}
                      className={cn(
                        'aspect-square rounded-md border flex flex-col items-center justify-center gap-0.5 text-sm transition-colors',
                        'hover:bg-accent hover:border-primary/50',
                        isSelected && 'ring-2 ring-primary bg-accent',
                        hasValue && !isSelected && 'bg-muted/50',
                        isLocked && 'border-warning/50'
                      )}
                    >
                      <span className="font-medium">{format(day, 'd')}</span>
                      {hasValue && (
                        <div className="flex items-center gap-0.5 text-xs">
                          <span className={cn(
                            submission.achieved_value === 5 && 'text-primary',
                            submission.achieved_value === 0 && 'text-destructive'
                          )}>
                            {getValueDisplay(submission.achieved_value, kpi?.uom_type)}
                          </span>
                          {isLocked && <Lock className="h-2.5 w-2.5 text-warning" />}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Selected Day Details */}
          {selectedDate && (
            <div className="border rounded-lg p-4 space-y-4 bg-muted/30">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-medium">
                    {format(selectedDate, 'EEEE, MMMM d, yyyy')}
                  </div>
                  {selectedSubmission && (
                    <div className="text-sm text-muted-foreground flex items-center gap-2 mt-1">
                      Current: {selectedSubmission.achieved_value ?? 'Not set'}
                      {selectedSubmission.is_resubmitted && (
                        <Badge variant="outline" className="text-warning border-warning">
                          <Lock className="h-3 w-3 mr-1" />
                          Final
                        </Badge>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* Value Input */}
              <div className="space-y-2">
                <Label>New Value</Label>
                {renderValueInput()}
              </div>

              {/* Remarks */}
              <div className="space-y-2">
                <Label>Remarks (Optional)</Label>
                <Textarea
                  value={remarks}
                  onChange={(e) => setRemarks(e.target.value)}
                  placeholder="Optional remarks..."
                  rows={2}
                />
              </div>

              {/* Reason - MANDATORY */}
              <div className="space-y-2">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Reason for Override *
                </Label>
                <Textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Enter the reason for this override (required)..."
                  rows={2}
                  className={!reason.trim() ? 'border-warning' : ''}
                />
              </div>
            </div>
          )}

          {/* Warning Banner */}
          <div className="bg-warning/10 border border-warning/30 rounded-lg p-3 flex items-start gap-2">
            <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-warning">Admin Override - No Restrictions</p>
              <p className="text-muted-foreground">
                You can enter data for any day. This bypasses date windows and resubmission locks.
                All changes are logged and the employee will be notified.
              </p>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Close
          </Button>
          <Button 
            onClick={handleSubmit} 
            disabled={!isValid || submitMutation.isPending}
          >
            {submitMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Save & Log
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
