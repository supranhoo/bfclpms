import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { X } from 'lucide-react';

/**
 * SafetyActiveFilterChips — Phase 6.
 * Renders a compact, ServiceNow-style row of "Label: value" chips with a
 * per-chip X to clear that single filter, plus a "Clear all" button when
 * one or more chips are active.
 *
 * Pure presentational — the parent owns filter state and resubmission.
 */

export interface SafetyFilterChip {
  key: string;
  label: string;
  value: string;
  onRemove: () => void;
}

interface Props {
  chips: SafetyFilterChip[];
  onClearAll?: () => void;
}

export function SafetyActiveFilterChips({ chips, onClearAll }: Props) {
  if (!chips.length) return null;
  return (
    <div
      className="flex items-center gap-2 flex-wrap rounded-md border bg-muted/30 px-3 py-2"
      aria-label="Active filters"
    >
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        Filters
      </span>
      {chips.map((c) => (
        <Badge
          key={c.key}
          variant="secondary"
          className="h-7 gap-1 pl-2 pr-1 text-xs font-normal"
        >
          <span className="text-muted-foreground">{c.label}:</span>
          <span className="font-medium">{c.value}</span>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-5 w-5 ml-1 hover:bg-background"
            onClick={c.onRemove}
            aria-label={`Remove ${c.label} filter`}
          >
            <X className="h-3 w-3" />
          </Button>
        </Badge>
      ))}
      {onClearAll && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs ml-auto"
          onClick={onClearAll}
        >
          Clear all
        </Button>
      )}
    </div>
  );
}