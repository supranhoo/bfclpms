import { useEffect } from 'react';
import { Users } from 'lucide-react';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useUrlFilterState } from '@/hooks/useUrlFilterState';
import { useIsMobile } from '@/hooks/use-mobile';
import type { EmployeeStatusMode } from '@/lib/reportEmployeeFilter';

interface EmployeeStatusFilterProps {
  value?: EmployeeStatusMode;
  onChange?: (mode: EmployeeStatusMode) => void;
  /** When true, syncs to URL param `emp_status`. Default true. */
  syncToUrl?: boolean;
  className?: string;
}

const VALID: EmployeeStatusMode[] = ['active', 'inactive', 'all'];

/**
 * Reusable Active / Inactive / All segmented control for reports.
 * Persists to ?emp_status=... so refresh keeps the choice.
 * Collapses to Select on mobile (<640px).
 */
export function EmployeeStatusFilter({
  value,
  onChange,
  syncToUrl = true,
  className,
}: EmployeeStatusFilterProps) {
  const isMobile = useIsMobile();
  const [urlValue, setUrlValue] = useUrlFilterState('emp_status', 'active');
  const current = (syncToUrl ? urlValue : value ?? 'active') as EmployeeStatusMode;
  const safe: EmployeeStatusMode = VALID.includes(current) ? current : 'active';

  // Notify parent of current value on mount + change
  useEffect(() => {
    onChange?.(safe);
  }, [safe, onChange]);

  const handleChange = (next: string) => {
    if (!next || !VALID.includes(next as EmployeeStatusMode)) return;
    const mode = next as EmployeeStatusMode;
    if (syncToUrl) setUrlValue(mode);
    onChange?.(mode);
  };

  if (isMobile) {
    return (
      <div className={className}>
        <Select value={safe} onValueChange={handleChange}>
          <SelectTrigger className="h-9 w-[160px]">
            <Users className="h-3.5 w-3.5 mr-1.5 text-muted-foreground" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">Active only</SelectItem>
            <SelectItem value="inactive">Inactive only</SelectItem>
            <SelectItem value="all">All employees</SelectItem>
          </SelectContent>
        </Select>
      </div>
    );
  }

  return (
    <div className={`flex items-center gap-2 ${className ?? ''}`}>
      <span className="text-xs text-muted-foreground hidden md:inline">Employees:</span>
      <ToggleGroup
        type="single"
        size="sm"
        value={safe}
        onValueChange={handleChange}
        variant="outline"
        className="border rounded-md"
      >
        <ToggleGroupItem value="active" className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          Active
        </ToggleGroupItem>
        <ToggleGroupItem value="inactive" className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          Inactive
        </ToggleGroupItem>
        <ToggleGroupItem value="all" className="h-8 px-3 text-xs data-[state=on]:bg-primary data-[state=on]:text-primary-foreground">
          All
        </ToggleGroupItem>
      </ToggleGroup>
    </div>
  );
}
