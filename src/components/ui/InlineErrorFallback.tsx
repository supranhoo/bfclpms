import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from './button';

/**
 * Small inline fallback used by inner ErrorBoundaries (e.g. dashboard
 * sub-sections). Replaces only the failing widget — sidebar and sibling
 * widgets keep working.
 */
export function InlineErrorFallback({
  label = 'This section is temporarily unavailable.',
  onRetry,
}: {
  label?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-4 text-sm"
    >
      <AlertTriangle className="h-5 w-5 shrink-0 text-destructive" />
      <div className="flex-1 space-y-2">
        <p className="text-foreground">{label}</p>
        <p className="text-xs text-muted-foreground">
          Try reloading the page or navigating away and back.
        </p>
        {onRetry && (
          <Button size="sm" variant="outline" onClick={onRetry} className="gap-1.5">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </Button>
        )}
      </div>
    </div>
  );
}