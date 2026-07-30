/**
 * ADR-206 / POLICY §WF-FM-RELATIONSHIP-SSOT — Reviewer relationship SSOT.
 *
 * Every reviewer surface (Team Reviews grid, Dashboard deep-link, scorecard
 * routing) MUST derive the viewer↔employee relationship from this single pure
 * function. The historical bug: the full-access branch of the Team grid and
 * the Dashboard deep-link path tagged only `direct` / `indirect` and then
 * silently defaulted an untagged employee to `direct`. A Functional Manager
 * (a per-employee relationship, not an app_role) therefore landed on the
 * Manager view, which is read-only once the KPI has passed `manager_check`.
 *
 * Ordering is deliberate: `functional` is resolved BEFORE the `direct`
 * fallback so a functional-only mapping can never degrade into a read-only
 * manager view.
 */

export type ReviewerRelationship = 'direct' | 'indirect' | 'functional' | 'other';

export interface RelationshipEmployee {
  id: string;
  reporting_manager_id?: string | null;
  functional_manager_id?: string | null;
  /** Pre-tagged by a server roster RPC (get_manager_team_roster). Trusted. */
  relationship?: ReviewerRelationship | 'direct' | 'indirect' | 'functional' | null;
}

export interface RelationshipInput {
  viewerId: string | null | undefined;
  employee: RelationshipEmployee;
  /** Ids known to be direct reports of the viewer. */
  directIds?: Set<string>;
  /** Ids known to be skip-level (indirect) reports of the viewer. */
  skipIds?: Set<string>;
  /** Ids known to be functional reports of the viewer. */
  functionalIds?: Set<string>;
  /** Manager id of the employee's manager, when already resolved. */
  managersManagerId?: string | null;
}

export function resolveReviewerRelationship(input: RelationshipInput): ReviewerRelationship {
  const { viewerId, employee, directIds, skipIds, functionalIds, managersManagerId } = input;

  // A server-tagged relationship always wins.
  if (employee.relationship === 'direct' || employee.relationship === 'indirect' || employee.relationship === 'functional') {
    return employee.relationship;
  }

  if (!viewerId) return 'other';

  if (employee.reporting_manager_id && employee.reporting_manager_id === viewerId) return 'direct';
  if (directIds?.has(employee.id)) return 'direct';

  if (skipIds?.has(employee.id)) return 'indirect';
  if (managersManagerId && managersManagerId === viewerId) return 'indirect';

  // Functional is checked before any fallback — see header note.
  if (employee.functional_manager_id && employee.functional_manager_id === viewerId) return 'functional';
  if (functionalIds?.has(employee.id)) return 'functional';

  return 'other';
}
