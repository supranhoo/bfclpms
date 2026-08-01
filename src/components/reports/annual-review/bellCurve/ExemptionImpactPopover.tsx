import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Info } from 'lucide-react';
import {
  ELIGIBILITY_STATUS_LABELS, describeExemptionPenalty, exemptionPenaltyFor,
  type EffectiveEligibility, type SlabCapOptions,
} from '@/lib/annualReview/effectiveEligibility';
import { formatSlabPercent } from '@/lib/annualReview/ratingSlab';
import { formatActual, formatExpected } from '@/lib/annualReview/eligibilityFormat';

/**
 * ADR-224 — transparency record. Shows which criteria were waived and exactly
 * how the configured exemption penalty changed the increment percentage.
 */
export function ExemptionImpactPopover({
  result, computedPercent, capOptions, label,
}: {
  result: EffectiveEligibility | null;
  computedPercent: number | null;
  capOptions?: SlabCapOptions;
  label?: string;
}) {
  if (!result || result.status === 'unknown') return null;
  const penalty = exemptionPenaltyFor(computedPercent, result.status, capOptions);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1 align-middle text-muted-foreground hover:text-foreground"
          aria-label="Exemption impact details"
        >
          <Info className="h-3.5 w-3.5" />
          {label && <span className="text-[11px]">{label}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 bg-popover z-50 text-sm space-y-2">
        <p className="font-medium">{ELIGIBILITY_STATUS_LABELS[result.status]}</p>

        {result.waived.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Waived criteria</p>
            {result.waived.map((f) => (
              <p key={f.criterion.id} className="text-xs">
                {f.criterion.name} — {formatActual(f.actual, f.criterion.type)} (needs {formatExpected(f.criterion)})
                {f.exemption?.reason ? ` · ${f.exemption.reason}` : ''}
              </p>
            ))}
          </div>
        )}

        {result.blocking.length > 0 && (
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Still blocking</p>
            {result.blocking.map((f) => (
              <p key={f.criterion.id} className="text-xs">
                {f.criterion.name} — {formatActual(f.actual, f.criterion.type)}
              </p>
            ))}
          </div>
        )}

        <div className="border-t pt-2 space-y-1">
          <p className="text-xs text-muted-foreground">Increment impact</p>
          {result.status === 'ineligible' ? (
            <p className="text-xs">Ineligible — increment shown as 0% (computed {formatSlabPercent(computedPercent)}).</p>
          ) : penalty.applied ? (
            <p className="text-xs">{describeExemptionPenalty(penalty)}</p>
          ) : (
            <p className="text-xs">No exemption penalty applied — {formatSlabPercent(computedPercent)}.</p>
          )}
        </div>

        {result.hasPendingExemption && (
          <Badge variant="outline" className="text-[10px]">Exemption request pending</Badge>
        )}
      </PopoverContent>
    </Popover>
  );
}