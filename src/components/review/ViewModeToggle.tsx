import { Home, Users, Shield, Briefcase, UserCheck, ClipboardCheck, UserCircle, UserCog, UserX } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useAppSettings } from '@/hooks/useAppSettings';

export type ViewMode = 'self' | 'team' | 'skip_level' | 'hr_pms' | 'audit' | 'management' | 'pending_self_review' | 'pending_manager_review' | 'pending_skip_review';

interface ViewModeToggleProps {
  currentMode: ViewMode;
  availableModes: ViewMode[];
  onModeChange: (mode: ViewMode) => void;
}

const modeConfig: Record<ViewMode, { label: string; icon: React.ElementType; description: string }> = {
  self: { label: 'My Dashboard', icon: Home, description: 'View your own KPIs' },
  team: { label: 'Team Reviews', icon: Users, description: 'Review direct & indirect reports' },
  skip_level: { label: 'Team Reviews', icon: UserCheck, description: 'Skip-level review' },
  hr_pms: { label: 'HR PMS', icon: ClipboardCheck, description: 'HR PMS team review' },
  audit: { label: 'Audit', icon: Shield, description: 'Audit performance evaluations' },
  management: { label: 'Management', icon: Briefcase, description: 'Final management review' },
  pending_self_review: { label: 'Self Review', icon: UserCircle, description: 'Employees pending self review' },
  pending_manager_review: { label: 'Manager Review', icon: UserCog, description: 'Employees pending manager review' },
  pending_skip_review: { label: 'Skip Mgr Review', icon: UserCheck, description: 'Employees pending skip-level review' },
};

export function ViewModeToggle({ currentMode, availableModes, onModeChange }: ViewModeToggleProps) {
  const { data: settings } = useAppSettings();
  const stripColor = settings?.view_mode_strip_color || '#3b82f6';

  // Only show if user has multiple modes available
  if (availableModes.length <= 1) return null;

  // Filter out skip_level from visible modes (merged into team)
  const visibleModes = availableModes.filter(m => m !== 'skip_level');

  return (
    <div
      className="flex items-center gap-1 p-1 rounded-lg border overflow-x-auto scrollbar-none"
      style={{ backgroundColor: stripColor }}
    >
      {visibleModes.map(mode => {
        const config = modeConfig[mode];
        const Icon = config.icon;
        const isActive = mode === currentMode;

        return (
          <Button
            key={mode}
            variant="ghost"
            size="sm"
            onClick={() => onModeChange(mode)}
            className={cn(
              'gap-2 transition-all border-0',
              isActive
                ? 'bg-white shadow-sm hover:bg-white'
                : 'bg-transparent text-white/90 hover:bg-white/15 hover:text-white'
            )}
            style={isActive ? { color: stripColor } : undefined}
          >
            <Icon className="h-4 w-4" />
            <span className="hidden sm:inline">{config.label}</span>
          </Button>
        );
      })}
    </div>
  );
}
