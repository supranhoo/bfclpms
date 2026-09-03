import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface TeamQueueToggleProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  actionableCount?: number;
  totalCount?: number;
}

/**
 * ADR-348 / POLICY §129 — Team Reviews queue toggle.
 * Switches between the default "Pending action only" actionable queue
 * and the full mapped downline.
 */
export function TeamQueueToggle({
  checked,
  onCheckedChange,
  actionableCount,
  totalCount,
}: TeamQueueToggleProps) {
  return (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <div className="flex items-center gap-2">
        <Switch
          id="team-queue-toggle"
          checked={checked}
          onCheckedChange={onCheckedChange}
          aria-label="Pending action only"
        />
        <Label htmlFor="team-queue-toggle" className="text-xs sm:text-sm font-medium cursor-pointer">
          Pending action only
        </Label>
      </div>
      {typeof actionableCount === 'number' && typeof totalCount === 'number' && (
        <span className="text-xs text-muted-foreground">
          {checked ? (
            <>
              Showing <span className="font-medium text-foreground">{actionableCount}</span> of{' '}
              <span className="font-medium text-foreground">{totalCount}</span> team members with items
              awaiting your review — switch off to see your full downline
            </>
          ) : (
            <>
              Showing all <span className="font-medium text-foreground">{totalCount}</span> mapped team
              members ({actionableCount} with pending items)
            </>
          )}
        </span>
      )}
    </div>
  );
}
