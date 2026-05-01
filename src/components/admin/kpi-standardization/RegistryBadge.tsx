import { Badge } from '@/components/ui/badge';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { BookCheck, BookOpen } from 'lucide-react';
import { useCanonicalResolver } from '@/hooks/useCanonicalResolver';
import { isCanonicalEnforcementPeriod } from '@/lib/canonicalEnforcementPeriod';

export interface RegistryBadgeProps {
  categoryId: string | null | undefined;
  kraName: string | null | undefined;
  kpiName: string | null | undefined;
  /** Optional period gate; when provided, badge stays hidden for pre-May-2026 flows. */
  reviewPeriod?: string | null;
  reviewYear?: number | null;
  className?: string;
}

/**
 * Phase 3a: tiny inline indicator that tells the author whether the
 * (KRA, KPI) text they have selected/typed is in the canonical registry.
 *
 * - Hidden until all three of (categoryId, kraName, kpiName) are present.
 * - Hidden when an explicit period is provided and falls outside enforcement scope.
 * - Read-only: never mutates anything. Single source of truth remains the DB trigger.
 */
export function RegistryBadge({
  categoryId,
  kraName,
  kpiName,
  reviewPeriod,
  reviewYear,
  className,
}: RegistryBadgeProps) {
  const ready =
    !!categoryId && !!kraName?.trim() && !!kpiName?.trim();

  // Period gate: skip for pre-May-2026 (data-repair) flows so we don't
  // nudge authors about historical records they shouldn't restandardize.
  const inScope =
    reviewPeriod === undefined && reviewYear === undefined
      ? true
      : isCanonicalEnforcementPeriod(reviewPeriod ?? null, reviewYear ?? null);

  const signatures = ready && inScope
    ? [{ category_id: categoryId!, kra_name: kraName!.trim(), kpi_name: kpiName!.trim() }]
    : [];

  const { data: resolved, isLoading } = useCanonicalResolver(signatures);

  if (!ready || !inScope || isLoading) return null;

  const match = resolved && resolved.size > 0 ? Array.from(resolved.values())[0] : null;
  const isRegistered = !!match?.definition_id;

  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Badge
            variant={isRegistered ? 'secondary' : 'outline'}
            className={`text-[10px] font-normal gap-1 ${
              isRegistered
                ? 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'border-amber-200 bg-amber-50 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400'
            } ${className ?? ''}`}
          >
            {isRegistered ? (
              <>
                <BookCheck className="h-2.5 w-2.5" />
                Registered
              </>
            ) : (
              <>
                <BookOpen className="h-2.5 w-2.5" />
                Not in registry
              </>
            )}
          </Badge>
        </TooltipTrigger>
        <TooltipContent side="top" className="text-xs max-w-xs">
          {isRegistered ? (
            <div>
              <div className="font-medium">{match!.canonical_kra_name} → {match!.canonical_kpi_name}</div>
              <div className="text-muted-foreground mt-0.5">
                This KPI is part of the canonical registry. New rows will be auto-linked.
              </div>
            </div>
          ) : (
            <div>
              <div className="font-medium">Custom KPI name</div>
              <div className="text-muted-foreground mt-0.5">
                This name has no canonical alias yet. The KPI will save fine; admins can promote it
                from the KPI Standardization → Health & Coverage tab.
              </div>
            </div>
          )}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}