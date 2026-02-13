import { Home, Users, Shield, Briefcase, UserCheck, ClipboardCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

export type ViewMode = 'self' | 'team' | 'skip_level' | 'hr_pms' | 'audit' | 'management';

interface ViewModeToggleProps {
  currentMode: ViewMode;
  availableModes: ViewMode[];
  onModeChange: (mode: ViewMode) => void;
}

const modeConfig: Record<ViewMode, { label: string; icon: React.ElementType; description: string }> = {
  self: { label: 'My Dashboard', icon: Home, description: 'View your own KPIs' },
  team: { label: 'Team Review', icon: Users, description: 'Review team KPIs' },
  skip_level: { label: 'Skip-Level', icon: UserCheck, description: 'Skip-level review' },
  hr_pms: { label: 'HR PMS', icon: ClipboardCheck, description: 'HR PMS team review' },
  audit: { label: 'Audit', icon: Shield, description: 'Audit performance evaluations' },
  management: { label: 'Management', icon: Briefcase, description: 'Final management review' },
};

export function ViewModeToggle({ currentMode, availableModes, onModeChange }: ViewModeToggleProps) {
  // Only show if user has multiple modes available
  if (availableModes.length <= 1) return null;

  return (
    <div className="flex items-center gap-1 p-1 rounded-lg bg-muted/50 border">
      {availableModes.map(mode => {
        const config = modeConfig[mode];
        const Icon = config.icon;
        const isActive = mode === currentMode;
        
        return (
          <Button
            key={mode}
            variant={isActive ? 'default' : 'ghost'}
            size="sm"
            onClick={() => onModeChange(mode)}
            className={cn(
              'gap-2 transition-all',
              isActive 
                ? 'shadow-sm' 
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{config.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
