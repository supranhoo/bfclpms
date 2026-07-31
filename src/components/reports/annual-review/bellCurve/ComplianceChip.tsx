import { cn } from '@/lib/utils';
import type { ComplianceLevel } from '@/lib/annualReview/bellCurve';

const CLS: Record<ComplianceLevel, string> = {
  green: 'bg-emerald-500/15 text-emerald-600 border-emerald-500/30',
  amber: 'bg-amber-500/15 text-amber-600 border-amber-500/30',
  red: 'bg-rose-500/15 text-rose-600 border-rose-500/30',
};

const LABEL: Record<ComplianceLevel, string> = {
  green: 'Within threshold',
  amber: 'Minor deviation',
  red: 'Major deviation',
};

export function ComplianceChip({ level, className }: { level: ComplianceLevel; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-medium', CLS[level], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {LABEL[level]}
    </span>
  );
}