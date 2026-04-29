import { type FormEvent, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Search, RotateCcw, Loader2 } from 'lucide-react';

/**
 * SafetyFilterBar — sanctioned filter shell for every Safety list page.
 * (POLICY §113 / ADR-050)
 *
 * Wraps an inline form so that pressing Enter inside any filter input also
 * submits. Search is the only primary action; Reset clears both submitted
 * state and child inputs (parent handles the latter via `onReset`).
 *
 * Children render the actual filter inputs. The bar imposes layout, the
 * primary/secondary buttons, and the busy state.
 */
export interface SafetyFilterBarProps {
  title?: string;
  description?: string;
  /** Fired on Search click or Enter inside any child input. */
  onSubmit: () => void;
  /** Fired on Reset click. Parent should clear inputs and call useManualQuery.reset(). */
  onReset?: () => void;
  /** Disables Search button while a submitted query is in flight. */
  isSubmitting?: boolean;
  /** Optional override for the primary button label. Default "Search". */
  submitLabel?: string;
  children: ReactNode;
}

export function SafetyFilterBar({
  title = 'Filters',
  description = 'Apply filters and click Search to load data.',
  onSubmit,
  onReset,
  isSubmitting = false,
  submitLabel = 'Search',
  children,
}: SafetyFilterBarProps) {
  const handleSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    onSubmit();
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-3">
            {children}
          </div>
          <div className="flex items-center justify-end gap-2 pt-1 border-t">
            {onReset && (
              <Button type="button" variant="outline" size="sm" onClick={onReset}>
                <RotateCcw className="h-4 w-4 mr-2" />
                Reset
              </Button>
            )}
            <Button type="submit" size="sm" disabled={isSubmitting}>
              {isSubmitting ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Search className="h-4 w-4 mr-2" />
              )}
              {submitLabel}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
