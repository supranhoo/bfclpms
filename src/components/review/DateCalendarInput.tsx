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
   
   // Build Date object from stored day value
   const currentDate = useMemo(() => {
     if (!value || value < 1 || value > 31) return undefined;
     return new Date(reviewYear, monthIndex, value);
   }, [value, reviewYear, monthIndex]);
   
   // Restrict calendar to review month only
   const monthStart = useMemo(() => new Date(reviewYear, monthIndex, 1), [reviewYear, monthIndex]);
   const monthEnd = useMemo(() => {
     const daysInMonth = getDaysInMonth(new Date(reviewYear, monthIndex));
     return new Date(reviewYear, monthIndex, daysInMonth);
   }, [reviewYear, monthIndex]);
   
   const handleSelect = (date: Date | undefined) => {
     if (date) {
       onChange(date.getDate());
     }
     setOpen(false);
   };
 
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
             {currentDate 
               ? format(currentDate, 'dd MMM yyyy')
               : 'Pick a date'}
           </Button>
         </PopoverTrigger>
         <PopoverContent className="w-auto p-0" align="start">
           <Calendar
             mode="single"
             selected={currentDate}
             onSelect={handleSelect}
             defaultMonth={monthStart}
             fromDate={monthStart}
             toDate={monthEnd}
             className="pointer-events-auto"
             initialFocus
           />
         </PopoverContent>
       </Popover>
       <p className="text-xs text-muted-foreground">
         Select a date within {reviewMonth} {reviewYear}
       </p>
     </div>
   );
 }