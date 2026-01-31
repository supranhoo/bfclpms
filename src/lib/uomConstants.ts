/**
 * Unit of Measure (UOM) constants for KPI management.
 * These are the standard UOM options available in dropdown selectors.
 */
export const UOM_OPTIONS = [
  { value: '%', label: 'Percentage (%)' },
  { value: 'Number', label: 'Number' },
  { value: 'Days', label: 'Days' },
  { value: 'Hours', label: 'Hours' },
  { value: 'Minutes', label: 'Minutes' },
  { value: 'Amount', label: 'Amount (₹)' },
  { value: 'Date', label: 'Date' },
  { value: 'Index', label: 'Index' },
  { value: 'Ratio', label: 'Ratio' },
  { value: 'Score', label: 'Score' },
  { value: 'Count', label: 'Count' },
  { value: 'Rate', label: 'Rate' },
] as const;

export type UomValue = typeof UOM_OPTIONS[number]['value'];

/**
 * Get the UOM values as a flat array for validation
 */
export const UOM_VALUES = UOM_OPTIONS.map(o => o.value);
