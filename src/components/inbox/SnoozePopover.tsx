import { useState } from 'react';
import { Clock, AlarmClock } from 'lucide-react';
import { addHours, setHours, setMinutes, addDays, nextMonday } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface SnoozePopoverProps {
  onSnooze: (until: Date) => void;
  isLoading?: boolean;
}

const PRESET_OPTIONS = [
  { label: '1 Hour', getDate: () => addHours(new Date(), 1) },
  { label: '4 Hours', getDate: () => addHours(new Date(), 4) },
  { label: 'Tomorrow 9 AM', getDate: () => setMinutes(setHours(addDays(new Date(), 1), 9), 0) },
  { label: 'Next Monday 9 AM', getDate: () => setMinutes(setHours(nextMonday(new Date()), 9), 0) },
];

export function SnoozePopover({ onSnooze, isLoading }: SnoozePopoverProps) {
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [customDate, setCustomDate] = useState<Date | undefined>(undefined);
  const [customTime, setCustomTime] = useState('09:00');

  const handlePreset = (getDate: () => Date) => {
    onSnooze(getDate());
    setOpen(false);
    setShowCustom(false);
  };

  const handleCustomSubmit = () => {
    if (!customDate) return;
    const [hours, minutes] = customTime.split(':').map(Number);
    const target = setMinutes(setHours(customDate, hours), minutes);
    if (target > new Date()) {
      onSnooze(target);
      setOpen(false);
      setShowCustom(false);
      setCustomDate(undefined);
    }
  };

  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setShowCustom(false); }}>
      <Tooltip>
        <TooltipTrigger asChild>
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              disabled={isLoading}
              onClick={(e) => e.stopPropagation()}
            >
              <AlarmClock className="h-4 w-4" />
            </Button>
          </PopoverTrigger>
        </TooltipTrigger>
        <TooltipContent>Snooze</TooltipContent>
      </Tooltip>
      <PopoverContent className="w-64 p-2" align="end" onClick={(e) => e.stopPropagation()}>
        <div className="space-y-1">
          <p className="text-xs font-medium text-muted-foreground px-2 py-1">Snooze until</p>
          {PRESET_OPTIONS.map((opt) => (
            <Button
              key={opt.label}
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm h-8"
              onClick={() => handlePreset(opt.getDate)}
            >
              <Clock className="h-3.5 w-3.5 mr-2 text-muted-foreground" />
              {opt.label}
            </Button>
          ))}
          
          {!showCustom ? (
            <Button
              variant="ghost"
              size="sm"
              className="w-full justify-start text-sm h-8 text-muted-foreground"
              onClick={() => setShowCustom(true)}
            >
              Custom...
            </Button>
          ) : (
            <div className="space-y-2 pt-2 border-t">
              <Calendar
                mode="single"
                selected={customDate}
                onSelect={setCustomDate}
                disabled={(date) => date < new Date()}
                className="p-0"
              />
              <div className="flex items-center gap-2 px-2">
                <Label className="text-xs shrink-0">Time</Label>
                <Input
                  type="time"
                  value={customTime}
                  onChange={(e) => setCustomTime(e.target.value)}
                  className="h-8 text-sm"
                />
              </div>
              <Button
                size="sm"
                className="w-full h-8"
                disabled={!customDate}
                onClick={handleCustomSubmit}
              >
                Snooze
              </Button>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
