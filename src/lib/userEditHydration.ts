/**
 * ADR-194 §FM-READ-PARITY — Single source of truth for the columns the
 * "Edit User" dialog hydrates directly from `profiles`.
 *
 * The roster RPC is intentionally slim for performance, so the dialog pulls
 * the editable columns on demand. When `functional_manager_id` was missing
 * from this projection the Functional Manager rendered blank even though the
 * value had been persisted correctly — the classic ADR-194 read-back bug.
 *
 * Keeping the list here (instead of inline in the component) lets the E2E
 * suite assert the projection can never silently drop a field again.
 */
export const USER_EDIT_HYDRATION_COLUMNS = [
  'group_doj',
  'doj',
  'confirmation_date',
  'location_id',
  'employee_category',
  'employment_status',
  'mobile_number',
  'functional_manager_id',
] as const;

/** Comma-joined projection string for `supabase.from('profiles').select(...)`. */
export const USER_EDIT_HYDRATION_SELECT = USER_EDIT_HYDRATION_COLUMNS.join(', ');
