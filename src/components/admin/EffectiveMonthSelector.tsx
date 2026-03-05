import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Calendar } from 'lucide-react';

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

interface EffectiveMonthSelectorProps {
  selectedMonth: string;
  selectedYear: number;
  onMonthChange: (month: string) => void;
  onYearChange: (year: number) => void;
}

export function EffectiveMonthSelector({
  selectedMonth,
  selectedYear,
  onMonthChange,
  onYearChange,
}: EffectiveMonthSelectorProps) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 1, currentYear, currentYear + 1];

  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/30">
      <Calendar className="h-4 w-4 text-muted-foreground shrink-0" />
      <Label className="text-sm font-medium whitespace-nowrap">Effective Month:</Label>
      <Select value={selectedMonth} onValueChange={onMonthChange}>
        <SelectTrigger className="w-[140px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {MONTHS.map(m => (
            <SelectItem key={m} value={m}>{m}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Label className="text-sm font-medium">Year:</Label>
      <Select value={String(selectedYear)} onValueChange={(v) => onYearChange(parseInt(v))}>
        <SelectTrigger className="w-[90px] h-8">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {years.map(y => (
            <SelectItem key={y} value={String(y)}>{y}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
