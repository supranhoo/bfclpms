import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Lock } from 'lucide-react';

interface FrequencyLockToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}

export function FrequencyLockToggle({ checked, onCheckedChange }: FrequencyLockToggleProps) {
  return (
    <div className="flex items-center gap-2 pb-0.5">
      <Switch
        id="show-freq-locked"
        checked={checked}
        onCheckedChange={onCheckedChange}
      />
      <Label htmlFor="show-freq-locked" className="text-sm cursor-pointer whitespace-nowrap flex items-center gap-1.5">
        <Lock className="h-3.5 w-3.5 text-muted-foreground" />
        Show frequency-locked KPIs
      </Label>
    </div>
  );
}
