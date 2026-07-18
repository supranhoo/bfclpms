## Assumptions
- Awadhesh Kumar Singh (100070) is viewing Shubham Kumar (100807) from Team Annual Review.
- The confirmed policy remains: employees who can log in must submit their own self-review; managers cannot proxy-submit for them.

## Clarifications
- Resolved: keep the login restriction.

## Risk & Impact Report
- **Data:** Shubham’s instance is `pending_self`; his self response is unlocked and contains all 12 scores. No score/draft reset is needed.
- **Workflow:** The instance’s snapshotted `manager_id` is null although Shubham’s live reporting manager is Vivek Kumar Patel (100711), not Awadhesh. This causes the generic read-only screen. Restoring the snapshot preserves the configured hierarchy; it does not grant Awadhesh proxy rights.
- **UI/UX:** Replace the ambiguous generic read-only state with a clear policy message explaining that Shubham must submit from his own account and identifying the active review owner/route.
- **Regression:** 499 pending-self instances have the same live-manager/snapshot drift; 17 belong under Awadhesh’s reporting subtree. A narrowly gated repair and regression tests prevent reviewer reassignment after a review advances.
- **Scalability:** One set-based repair on pending-self rows only; no new unpaginated queries or client load.
- **Rollback:** Additive migration with an audit record of old/new reviewer IDs; rollback can restore values from that audit.

## Step-by-step Plan
1. Add a migration that resynchronizes `manager_id` from the current profile hierarchy only for `pending_self` instances where the snapshot is null/drifted, including 100807, without touching scores, responses, templates, or later-stage reviews.
2. Record every repaired row in the existing reviewer-resync audit mechanism (or a dedicated immutable audit table if its schema is incompatible).
3. Keep `can_proxy_submit_annual_review` unchanged so login-enabled employees remain ineligible for assisted submission.
4. Update the Team detail read-only presentation to explain the reason instead of implying a broken form; include a route back to the queue. No editable controls will be shown to Awadhesh for 100807.
5. Add regression tests and realistic mocks for: pending-self null manager repair, later-stage preservation, unlocked self draft preservation, and login-enabled proxy denial.
6. Update `DOCUMENTATION.md`, annual-review `DOCUMENTATION.md`, and `POLICY.md` with the corrected RCA, 5 Whys, CAPA, version history, and rollback details.
7. Verify 100807 remains `pending_self`, retains all saved scores, has the correct manager snapshot, and that the manager view clearly directs Shubham to submit from **My Annual Review**.

## UI Changes
- **Location:** Team Annual Review detail, where “Read-only view” currently appears.
- **Visual:** Clear non-editable notice: this employee has login access and must submit personally; manager assistance is unavailable by policy.
- **Interaction:** Back-to-queue remains available; no proxy submit controls.
- **Responsive:** Existing card layout and mobile wrapping retained.

## Implementation
- Pending approval.

## Tests
- Migration/source regression tests plus focused component tests for the policy-specific read-only state.

## DOCUMENTATION.md updates
- Correct ADR-120’s earlier diagnosis and add the manager-snapshot RCA/CAPA and version entry.

## POLICY.md updates
- Reaffirm the login restriction and document reviewer-snapshot repair boundaries.

## Post-implementation notes
- Shubham must submit using employee code 100807 through **My Annual Review**. Awadhesh will not be allowed to complete Shubham’s self-stage under the selected policy.