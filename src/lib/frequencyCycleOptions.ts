/**
 * Shared frequency cycle option constants.
 * Used by FrequencyCycleSettings (global defaults), KPI create/edit dialogs (per-KPI override),
 * and frequencyUtils (locking logic).
 */

export interface CycleOption {
  /** Value stored in frequency_cycle_start column */
  value: string;
  /** Display label */
  label: string;
  /** Description shown in settings UI */
  description: string;
  /** sub_frequency column value for frequency_config */
  subFrequency: string;
  /** locked_months for frequency_config */
  lockedMonths: Record<string, number[]>;
  /** active_month for frequency_config */
  activeMonth: number;
}

export const BI_MONTHLY_OPTIONS: CycleOption[] = [
  {
    value: 'Jan-Feb',
    label: 'Standard (Jan Start)',
    description: 'Jan-Feb, Mar-Apr, May-Jun, Jul-Aug, Sep-Oct, Nov-Dec',
    subFrequency: 'Jan-Feb,Mar-Apr,May-Jun,Jul-Aug,Sep-Oct,Nov-Dec',
    lockedMonths: {
      'Jan-Feb': [1],
      'Mar-Apr': [3],
      'May-Jun': [5],
      'Jul-Aug': [7],
      'Sep-Oct': [9],
      'Nov-Dec': [11],
    },
    activeMonth: 2,
  },
  {
    value: 'Feb-Mar',
    label: 'Offset (Feb Start)',
    description: 'Feb-Mar, Apr-May, Jun-Jul, Aug-Sep, Oct-Nov, Dec-Jan',
    subFrequency: 'Feb-Mar,Apr-May,Jun-Jul,Aug-Sep,Oct-Nov,Dec-Jan',
    lockedMonths: {
      'Feb-Mar': [2],
      'Apr-May': [4],
      'Jun-Jul': [6],
      'Aug-Sep': [8],
      'Oct-Nov': [10],
      'Dec-Jan': [12],
    },
    activeMonth: 3,
  },
];

export const QUARTERLY_OPTIONS: CycleOption[] = [
  {
    value: 'Jan-Mar',
    label: 'Standard (Calendar Year)',
    description: 'Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec',
    subFrequency: 'Jan-Mar,Apr-Jun,Jul-Sep,Oct-Dec',
    lockedMonths: { Q1: [1, 2], Q2: [4, 5], Q3: [7, 8], Q4: [10, 11] },
    activeMonth: 3,
  },
  {
    value: 'Apr-Jun',
    label: 'Financial Year (Apr Start)',
    description: 'Q1: Apr-Jun, Q2: Jul-Sep, Q3: Oct-Dec, Q4: Jan-Mar',
    subFrequency: 'Apr-Jun,Jul-Sep,Oct-Dec,Jan-Mar',
    lockedMonths: { Q1: [4, 5], Q2: [7, 8], Q3: [10, 11], Q4: [1, 2] },
    activeMonth: 6,
  },
  {
    value: 'Jul-Sep',
    label: 'Mid-Year (Jul Start)',
    description: 'Q1: Jul-Sep, Q2: Oct-Dec, Q3: Jan-Mar, Q4: Apr-Jun',
    subFrequency: 'Jul-Sep,Oct-Dec,Jan-Mar,Apr-Jun',
    lockedMonths: { Q1: [7, 8], Q2: [10, 11], Q3: [1, 2], Q4: [4, 5] },
    activeMonth: 9,
  },
];

export const HALF_YEARLY_OPTIONS: CycleOption[] = [
  {
    value: 'Jan-Jun',
    label: 'Standard (Calendar Year)',
    description: 'H1: Jan-Jun, H2: Jul-Dec',
    subFrequency: 'Jan-Jun,Jul-Dec',
    lockedMonths: { H1: [1, 2, 3, 4, 5], H2: [7, 8, 9, 10, 11] },
    activeMonth: 6,
  },
  {
    value: 'Apr-Sep',
    label: 'Financial Year (Apr Start)',
    description: 'H1: Apr-Sep, H2: Oct-Mar',
    subFrequency: 'Apr-Sep,Oct-Mar',
    lockedMonths: { H1: [4, 5, 6, 7, 8], H2: [10, 11, 12, 1, 2] },
    activeMonth: 9,
  },
  {
    value: 'Jul-Dec',
    label: 'Mid-Year (Jul Start)',
    description: 'H1: Jul-Dec, H2: Jan-Jun',
    subFrequency: 'Jul-Dec,Jan-Jun',
    lockedMonths: { H1: [7, 8, 9, 10, 11], H2: [1, 2, 3, 4, 5] },
    activeMonth: 12,
  },
  {
    value: 'May-Oct',
    label: 'Financial Year — Review in Apr & Oct',
    description: 'H1: May–Oct (review in Oct), H2: Nov–Apr (review in Apr). For KPIs reviewed after the FY half closes (e.g. post-cycle stock audits).',
    subFrequency: 'May-Oct,Nov-Apr',
    lockedMonths: { H1: [5, 6, 7, 8, 9], H2: [11, 12, 1, 2, 3] },
    activeMonth: 10,
  },
];

export const YEARLY_OPTIONS: CycleOption[] = [
  {
    value: 'Jan-Dec',
    label: 'Calendar Year (Jan-Dec)',
    description: 'Review in December',
    subFrequency: 'Jan-Dec',
    lockedMonths: { 'Jan-Dec': [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
    activeMonth: 12,
  },
  {
    value: 'Apr-Mar',
    label: 'Financial Year (Apr-Mar)',
    description: 'Review in March',
    subFrequency: 'Apr-Mar',
    lockedMonths: { 'Apr-Mar': [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2] },
    activeMonth: 3,
  },
  {
    value: 'Jul-Jun',
    label: 'Mid-Year (Jul-Jun)',
    description: 'Review in June',
    subFrequency: 'Jul-Jun',
    lockedMonths: { 'Jul-Jun': [7, 8, 9, 10, 11, 12, 1, 2, 3, 4, 5] },
    activeMonth: 6,
  },
];

/** Frequencies that support per-KPI cycle start override */
export const MULTI_MONTH_FREQUENCIES = ['Bi-Monthly', 'Quarterly', 'Half-Yearly', 'Yearly'];

/**
 * Get the available cycle options for a given frequency.
 * Returns undefined for frequencies that don't support cycle start configuration.
 */
export function getCycleOptionsForFrequency(rawFrequency: string | null | undefined): CycleOption[] | undefined {
  if (!rawFrequency) return undefined;
  const key = rawFrequency.toLowerCase().replace(/[-\s]/g, '');
  const map: Record<string, CycleOption[]> = {
    bimonthly: BI_MONTHLY_OPTIONS,
    quarterly: QUARTERLY_OPTIONS,
    halfyearly: HALF_YEARLY_OPTIONS,
    yearly: YEARLY_OPTIONS,
  };
  return map[key];
}

/**
 * Get the default cycle start value for a given frequency.
 */
export function getDefaultCycleStart(frequency: string | null | undefined): string | undefined {
  const options = getCycleOptionsForFrequency(frequency);
  return options?.[0]?.value;
}

/**
 * Resolve the effective cycle option for a KPI.
 * Priority: per-KPI override → global config → first option (hardcoded default).
 */
export function resolveEffectiveCycleOption(
  frequency: string | null | undefined,
  kpiCycleStart?: string | null,
  globalConfigSubFrequency?: string | null
): CycleOption | undefined {
  const options = getCycleOptionsForFrequency(frequency);
  if (!options) return undefined;

  // 1. Per-KPI override
  if (kpiCycleStart) {
    const match = options.find(o => o.value === kpiCycleStart);
    if (match) return match;
  }

  // 2. Global config match by sub_frequency
  if (globalConfigSubFrequency) {
    const match = options.find(o => o.subFrequency === globalConfigSubFrequency);
    if (match) return match;
  }

  // 3. Hardcoded default (first option)
  return options[0];
}
