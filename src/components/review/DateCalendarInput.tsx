 import { useState, useMemo } from 'react';
 import { format, getDaysInMonth } from 'date-fns';
 import { CalendarIcon } from 'lucide-react';
 import { cn } from '@/lib/utils';
 import { Button } from '@/components/ui/button';
 import { Calendar } from '@/components/ui/calendar';
 import { Label } from '@/components/ui/label';
 import {
   Popover,
   PopoverContent,
   PopoverTrigger,
 } from '@/components/ui/popover';
 
 const MONTHS = [
   'January', 'February', 'March', 'April', 'May', 'June',
   'July', 'August', 'September', 'October', 'November', 'December'
 ];
 
 interface DateCalendarInputProps {
   value: number | null;
   onChange: (day: number | null) => void;
   reviewMonth: string;  // "January", "February", etc.
   reviewYear: number;
   disabled?: boolean;
   label?: string;
 }
 
 export function DateCalendarInput({
   value,
   onChange,
   reviewMonth,
   reviewYear,
   disabled = false,
   label = 'Select Date',
 }: DateCalendarInputProps) {
   const [open, setOpen] = useState(false);
   
   // Get month index (0-11)
   const monthIndex = useMemo(() => {
     const idx = MONTHS.findIndex(m => m.toLowerCase() === reviewMonth.toLowerCase());
     return idx >= 0 ? idx : 0;
   }, [reviewMonth]);
   
  // Previous month index and year (for allowing pre-month completion)
  const prevMonthIndex = monthIndex === 0 ? 11 : monthIndex - 1;
  const prevMonthYear = monthIndex === 0 ? reviewYear - 1 : reviewYear;
  
  // Build Date object from stored day value
  // value === 0 means "completed before the review month"
  const currentDate = useMemo(() => {
    if (value === null || value === undefined) return undefined;
    if (value === 0) {
      // Show last day of previous month for display
      const lastDayPrev = getDaysInMonth(new Date(prevMonthYear, prevMonthIndex));
      return new Date(prevMonthYear, prevMonthIndex, lastDayPrev);
    }
    if (value < 1 || value > 31) return undefined;
    return new Date(reviewYear, monthIndex, value);
  }, [value, reviewYear, monthIndex, prevMonthYear, prevMonthIndex]);
  
  // Expand calendar range to include previous month
  const rangeStart = useMemo(() => new Date(prevMonthYear, prevMonthIndex, 1), [prevMonthYear, prevMonthIndex]);
  const monthEnd = useMemo(() => {
    const daysInMonth = getDaysInMonth(new Date(reviewYear, monthIndex));
    return new Date(reviewYear, monthIndex, daysInMonth);
  }, [reviewYear, monthIndex]);
   
  const handleSelect = (date: Date | undefined) => {
    if (date) {
      // If selected date is in the previous month, store 0
      if (date.getMonth() === prevMonthIndex && date.getFullYear() === prevMonthYear) {
        onChange(0);
      } else {
        onChange(date.getDate());
      }
    }
    setOpen(false);
  };
  
  // Display text for the button
  const displayText = useMemo(() => {
    if (value === 0) return `Before 1st ${reviewMonth}`;
    if (currentDate) return format(currentDate, 'dd MMM yyyy');
    return null;
  }, [value, currentDate, reviewMonth]);
 
   return (
     <div className="space-y-2">
       <Label>{label}</Label>
       <Popover open={open} onOpenChange={setOpen}>
         <PopoverTrigger asChild>
           <Button
             variant="outline"
             className={cn(
               'w-full justify-start text-left font-normal',
               !currentDate && 'text-muted-foreground'
             )}
             disabled={disabled}
           >
            <CalendarIcon className="mr-2 h-4 w-4" />
              {displayText || 'Pick a date'}
           </Button>
         </PopoverTrigger>
         <PopoverContent className="w-auto p-0" align="start">
            <Calendar
              mode="single"
              selected={currentDate}
              onSelect={handleSelect}
              defaultMonth={new Date(reviewYear, monthIndex, 1)}
              fromDate={rangeStart}
              toDate={monthEnd}
             className="pointer-events-auto"
             initialFocus
           />
         </PopoverContent>
       </Popover>
        <p className="text-xs text-muted-foreground">
          Select a date within {reviewMonth} {reviewYear} or previous month (for early completion)
        </p>
     </div>
   );
 }