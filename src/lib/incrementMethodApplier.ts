/**
 * Applies the configured increment method to a slab-determined base percent.
 *
 *  - full         → return base percent unchanged
 *  - prorated_doj → (base / 12) * monthsServed, capped at base (months from GDOJ)
 *  - custom       → look up monthsServed in [from..to] slabs, multiply base by percent_of_slab/100
 */

export type ApplierMethod = 'full' | 'prorated_doj' | 'custom';

export interface CustomMethodSlab {
  from_months: number;
  /** inclusive upper bound; null = open-ended */
  to_months: number | null;
  /** percent of slab to apply, 0–100 */
  percent_of_slab: number;
}

export interface ApplyInput {
  method: ApplierMethod;
  basePercent: number;
  monthsServed: number;
  customSlabs?: CustomMethodSlab[];
}

export interface ApplyResult {
  eligiblePercent: number;
  notes: string;
}

export function applyIncrementMethod(input: ApplyInput): ApplyResult {
  const { method, basePercent, monthsServed } = input;
  if (basePercent <= 0) return { eligiblePercent: 0, notes: 'Base percent is zero' };

  switch (method) {
    case 'full':
      return { eligiblePercent: basePercent, notes: 'Full increment' };

    case 'prorated_doj': {
      const months = Math.max(0, Math.min(12, monthsServed));
      const eligible = +((basePercent / 12) * months).toFixed(4);
      return {
        eligiblePercent: eligible,
        notes: `Prorated by GDOJ: ${basePercent}% × ${months}/12`,
      };
    }

    case 'custom': {
      const slabs = input.customSlabs ?? [];
      const slab = slabs.find(
        (s) => monthsServed >= s.from_months && (s.to_months === null || monthsServed <= s.to_months),
      );
      if (!slab) return { eligiblePercent: 0, notes: `No slab match for ${monthsServed} months` };
      const eligible = +((basePercent * slab.percent_of_slab) / 100).toFixed(4);
      return {
        eligiblePercent: eligible,
        notes: `Custom slab: ${slab.percent_of_slab}% of ${basePercent}%`,
      };
    }
  }
}