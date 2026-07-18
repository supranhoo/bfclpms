/**
 * Employees must edit their own review on the employee surface. The team
 * detail surface intentionally resolves only reviewer/proxy roles and would
 * otherwise render the employee's pending self-review as read-only.
 */
export function shouldRedirectToOwnAnnualReview(
  employeeId: string | null | undefined,
  viewerId: string | null | undefined,
): boolean {
  return !!employeeId && !!viewerId && employeeId === viewerId;
}