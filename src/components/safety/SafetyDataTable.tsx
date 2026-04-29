import { type ReactNode } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react';
import { SafetyEmptyState } from './SafetyEmptyState';
import { SAFETY_PAGE_SIZE_OPTIONS } from '@/hooks/useManualQuery';

/**
 * SafetyDataTable — sanctioned tabular shell for every Safety list page.
 * (POLICY §113 / ADR-050)
 *
 * Renders three states:
 * 1. `hasSubmitted=false` → SafetyEmptyState variant="awaiting-search"
 * 2. `isLoading=true`     → centered spinner
 * 3. `rows.length===0`    → SafetyEmptyState variant="no-results"
 * Otherwise renders the children (the actual <Table>) with a sticky
 * pagination footer (`Page X of Y · 25/50/100 · N total`).
 *
 * The component is intentionally presentation-only — pagination state
 * lives in `useManualQuery` in the parent.
 */
export interface SafetyDataTableProps {
  title: string;
  hasSubmitted: boolean;
  isLoading: boolean;
  rowCount: number;
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  /** The actual <Table> markup. Only rendered when there are rows to show. */
  children: ReactNode;
  /** Optional right-side header slot (e.g. an Export button). */
  headerActions?: ReactNode;
}

export function SafetyDataTable({
  title,
  hasSubmitted,
  isLoading,
  rowCount,
  total,
  page,
  pageSize,
  totalPages,
  onPageChange,
  onPageSizeChange,
  children,
  headerActions,
}: SafetyDataTableProps) {
  const showAwaiting = !hasSubmitted;
  const showLoading = hasSubmitted && isLoading;
  const showEmpty = hasSubmitted && !isLoading && rowCount === 0;
  const showRows = hasSubmitted && !isLoading && rowCount > 0;

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
          <div className="flex items-center justify-center py-12 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" />
            Loading…
          </div>
        )}

        {showEmpty && <SafetyEmptyState variant="no-results" />}

        {showRows && (
          <>
            <div className="overflow-x-auto">{children}</div>
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t bg-muted/20 sticky bottom-0">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>Rows per page</span>
                <Select
                  value={String(pageSize)}
                  onValueChange={(v) => onPageSizeChange(Number(v))}
                >
                  <SelectTrigger className="h-7 w-[80px] text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SAFETY_PAGE_SIZE_OPTIONS.map((s) => (
                      <SelectItem key={s} value={String(s)}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>
                  Page <span className="font-medium text-foreground">{page}</span> of{' '}
                  <span className="font-medium text-foreground">{totalPages}</span>
                </span>
                <div className="flex items-center gap-1">
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPageChange(page - 1)}
                    disabled={page <= 1}
                    aria-label="Previous page"
                  >
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => onPageChange(page + 1)}
                    disabled={page >= totalPages}
                    aria-label="Next page"
                  >
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
