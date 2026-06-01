/**
 * RequiredMark — small red lowercase "l" indicator used to mark
 * mandatory fields on the Add New User page.
 *
 * IMPORTANT: never use "*" or capital "I" as the indicator.
 */
export const RequiredMark = () => (
  <span
    aria-label="required"
    title="Required"
    className="text-destructive font-semibold ml-0.5 select-none"
    style={{ textTransform: 'lowercase' }}
  >
    l
  </span>
);