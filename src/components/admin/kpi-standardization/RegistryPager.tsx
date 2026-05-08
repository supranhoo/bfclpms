import { useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

/**
 * Reusable client-side pager for the KPI Standardization tabs (POLICY §120).
 * Decoupled from data: parent keeps the source array and slices it via
 * `pagedSlice()`. This pager only renders controls and emits page changes.
 */

export const REGISTRY_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;

interface Props {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (next: number) => void;
  onPageSizeChange: (next: number) => void;
  pageSizeOptions?: readonly number[];
  className?: string;
  /**
   * When this string changes, the pager auto-resets back to page 1. Use it
   * to track the current filter signature (search + selects + toggles) so
   * users never get stranded on an empty page.
   */
  resetKey?: string;
}

export function pagedSlice<T>(rows: T[], page: number, pageSize: number): T[] {
  const from = Math.max(0, (page - 1) * pageSize);
  return rows.slice(from, from + pageSize);
}

export function totalPages(total: number, pageSize: number): number {
  return Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
}

export function RegistryPager({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  pageSizeOptions = REGISTRY_PAGE_SIZE_OPTIONS,
  className,
  resetKey,
}: Props) {
  const pages = totalPages(total, pageSize);

  // Reset to page 1 whenever the filter signature changes.
  useEffect(() => {
    if (resetKey !== undefined && page !== 1) onPageChange(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resetKey]);

  // Clamp out-of-range page (e.g. after filtering shrinks total).
  useEffect(() => {
    if (page > pages) onPageChange(pages);
  }, [page, pages, onPageChange]);

  if (total === 0) return null;

  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  return (
    <div className={`flex items-center justify-between gap-3 flex-wrap text-xs ${className ?? ''}`}>
      <div className="text-muted-foreground">
        Showing {from.toLocaleString()}–{to.toLocaleString()} of {total.toLocaleString()}
      </div>
      <div className="flex items-center gap-2">
        <span className="text-muted-foreground">Per page</span>
        <Select value={String(pageSize)} onValueChange={v => onPageSizeChange(Number(v))}>
          <SelectTrigger className="h-7 w-[72px] text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {pageSizeOptions.map(n => (
              <SelectItem key={n} value={String(n)} className="text-xs">{n}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={page <= 1}
          onClick={() => onPageChange(Math.max(1, page - 1))}
        >
          Prev
        </Button>
        <span className="text-muted-foreground tabular-nums">
          {page} / {pages}
        </span>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs"
          disabled={page >= pages}
          onClick={() => onPageChange(Math.min(pages, page + 1))}
        >
          Next
        </Button>
      </div>
    </div>
  );
}