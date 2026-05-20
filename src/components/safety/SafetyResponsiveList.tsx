import { type ReactNode } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { SafetyEmptyState } from './SafetyEmptyState';

/**
 * SafetyResponsiveList
 * --------------------
 * Drop-in replacement for `SafetyDataTable` when a page wants:
 *   - desktop (≥ md): a `<Table>` (passed as `children`)
 *   - mobile  (< md): a stack of `SafetyMobileListCard`s (built by `mobileRender`)
 *
 * Same pagination / empty / loading semantics as SafetyDataTable so callers
 * can swap with no surprise UX changes. Mobile pagination strip is compact:
 * Prev · "Page X / Y" · Next (rows-per-page is hidden on mobile and stays
 * at the parent's default).
 */
export interface SafetyResponsiveListProps<T> {
  title: string;
  hasSubmitted: boolean;
  isLoading: boolean;
  rows: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  /** Renders one mobile card per row. */
  mobileRender: (row: T, index: number) => ReactNode;
  /** The `<Table>…` markup shown on md+. */
  children: ReactNode;
  /** Optional right-side header slot. */
  headerActions?: ReactNode;
  /** Optional desktop-only pagination footer (rows/size). Hidden on mobile. */
  desktopFooter?: ReactNode;
  /**
   * Optional skeleton to render in place of the spinner while `isLoading`.
   * Pass `<SafetySkeletonBlock variant="list" />` for sanctioned UX.
   */
  loadingSkeleton?: ReactNode;
}

export function SafetyResponsiveList<T>({
  title,
  hasSubmitted,
  isLoading,
  rows,
  total,
  page,
  totalPages,
  onPageChange,
  mobileRender,
  children,
  headerActions,
  desktopFooter,
  loadingSkeleton,
}: SafetyResponsiveListProps<T>) {
  const isMobile = useIsMobile();
  const showAwaiting = !hasSubmitted;
  const showLoading = hasSubmitted && isLoading;
  const showEmpty = hasSubmitted && !isLoading && rows.length === 0;
  const showRows = hasSubmitted && !isLoading && rows.length > 0;

  return (
    <Card>
      <CardHeader className="pb-2 flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-base flex items-center gap-2">
          {title}
          {hasSubmitted && (
            <Badge variant="secondary" className="text-[11px]">
              {total.toLocaleString()} total
            </Badge>
          )}
        </CardTitle>
        {headerActions}
      </CardHeader>
      <CardContent className="p-0">
        {showAwaiting && <SafetyEmptyState variant="awaiting-search" />}

        {showLoading && (
          loadingSkeleton ?? (
            <div className="flex items-center justify-center py-12 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              Loading…
            </div>
          )
        )}

        {showEmpty && <SafetyEmptyState variant="no-results" />}

        {showRows && (
          <>
            {isMobile ? (
              <div className="p-2 space-y-2">
                {rows.map((row, idx) => (
                  <div key={idx}>{mobileRender(row, idx)}</div>
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">{children}</div>
            )}

            {/* Mobile compact pager */}
            {isMobile ? (
              <div className="flex items-center justify-between gap-2 px-3 py-2 border-t bg-muted/20 text-xs text-muted-foreground">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 min-w-[44px]"
                  onClick={() => onPageChange(page - 1)}
                  disabled={page <= 1}
                  aria-label="Previous page"
                >
                  <ChevronLeft className="h-4 w-4" />
                </Button>
                <span>
                  Page <span className="font-medium text-foreground">{page}</span> /{' '}
                  <span className="font-medium text-foreground">{totalPages}</span>
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 min-w-[44px]"
                  onClick={() => onPageChange(page + 1)}
                  disabled={page >= totalPages}
                  aria-label="Next page"
                >
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              desktopFooter
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}