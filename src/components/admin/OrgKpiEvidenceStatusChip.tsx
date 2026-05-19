import { Badge } from '@/components/ui/badge';
import { FileText, FileWarning } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  count: number;
  className?: string;
  onClick?: () => void;
}

/**
 * Compact "Supporting" chip — shows the number of evidence files on an OKV
 * row. Used in the card header and the tile rollup so admins can tell at a
 * glance whether supporting documents are attached.
 */
export function OrgKpiEvidenceStatusChip({ count, className, onClick }: Props) {
  const empty = count === 0;
  return (
    <Badge
      variant="outline"
      onClick={onClick}
      className={cn(
        'gap-1 text-[10px] font-medium cursor-pointer hover:bg-accent transition-colors',
        empty
          ? 'text-amber-700 border-amber-300 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/30 dark:border-amber-800'
          : 'text-emerald-700 border-emerald-300 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/30 dark:border-emerald-800',
        className,
      )}
    >
      {empty ? <FileWarning className="h-3 w-3" /> : <FileText className="h-3 w-3" />}
      {empty ? 'No supporting' : `${count} file${count === 1 ? '' : 's'}`}
    </Badge>
  );
}