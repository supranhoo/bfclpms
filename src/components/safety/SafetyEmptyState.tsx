import { Search, Inbox } from 'lucide-react';
import { type ReactNode } from 'react';

/**
 * SafetyEmptyState — sanctioned empty/awaiting-search renderer for
 * Safety list surfaces. (POLICY §113 / ADR-050)
 *
 * Variants:
 * - "awaiting-search": shown before any Search has been clicked.
 * - "no-results": shown after a search returns zero rows.
 */
export interface SafetyEmptyStateProps {
  variant: 'awaiting-search' | 'no-results';
  title?: string;
  description?: string;
  action?: ReactNode;
}

const DEFAULTS: Record<SafetyEmptyStateProps['variant'], { title: string; description: string }> = {
  'awaiting-search': {
    title: 'Apply filters and click Search',
    description: 'No data is loaded until you run a search. Set the filters above and press Search to load results.',
  },
  'no-results': {
    title: 'No results match these filters',
    description: 'Try widening the date range, clearing a filter, or searching with a different term.',
  },
};

export function SafetyEmptyState({ variant, title, description, action }: SafetyEmptyStateProps) {
  const Icon = variant === 'awaiting-search' ? Search : Inbox;
  const d = DEFAULTS[variant];
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4 gap-3">
      <div className="p-3 rounded-full bg-muted text-muted-foreground">
        <Icon className="h-7 w-7" />
      </div>
      <div className="space-y-1">
        <p className="text-sm font-medium text-foreground">{title ?? d.title}</p>
        <p className="text-xs text-muted-foreground max-w-md">{description ?? d.description}</p>
      </div>
      {action}
    </div>
  );
}
