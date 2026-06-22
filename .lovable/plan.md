## Assumptions
- The failing page is Team Reviews for Sajid Raza at `/dashboard?view=team` on the published/custom domain.
- The desired outcome is to show Sajid’s active direct reports instead of the fatal “Couldn’t load this dashboard” state.
- Existing policy remains: inactive users stay hidden, and manager Team Reviews is direct + skip-level roster scoped.

## Clarifications
- Not Applicable.

## Risk & Impact Report
- **Data Impact:** No historical KPI/review data changes. One additive backend function/migration is likely required to provide a manager-scoped roster RPC; no destructive schema changes.
- **Workflow Impact:** Manager Team Reviews will load roster from one policy-safe backend function instead of two client-side `profiles` queries. Review permissions and scoring workflow remain unchanged.
- **UI/UX Impact:** Same screen and layout. The only visible change is that the Team Members list should render employees; the fatal error appears only if the new roster RPC itself fails.
- **Regression Risk:** Medium, because Team Reviews shares data with KPI stats, filters, and export. Mitigation: keep existing hooks untouched where possible and switch only the manager Team Reviews roster source.
- **Scalability Impact:** The current skip-level path can return 172+ rows and uses client-side joins. The fix should return a bounded, slim roster payload from the backend and keep existing UI pagination.
- **Rollback Strategy:** Revert the new hook/component wiring and drop/ignore the additive RPC if needed; no data loss.

## Step-by-step Plan
1. **Confirm the root cause in code**
   - Treat this as a roster-source failure, not a KPI stats failure.
   - The backend is healthy and Sajid has 13 active direct reports plus 172 active skip-level reports.
   - The UI still enters `rosterDataError`, meaning `useTeamMembers` or `useSkipLevelTeamMembers` is failing in the browser path.

2. **Add a backend roster RPC for manager Team Reviews**
   - Create a `SECURITY DEFINER` read function for the authenticated viewer’s team roster.
   - It should return only active employees visible to the viewer: direct reports and skip-level reports.
   - It should include only fields needed by the grid plus department display fields.
   - Grant execute to `authenticated` and `service_role` only.

3. **Add a dedicated frontend hook**
   - Add `useManagerTeamRoster(viewerId)` in the organization hook layer.
   - Gate it by valid UUID/auth readiness.
   - Query the new RPC with React Query and keep previous data.
   - Preserve pagination/data-size safety.

4. **Switch non-full-access Team Reviews to the RPC roster source**
   - In `EmployeeSelectorGrid`, for `viewLevel === 'team' && !isFullAccess`, use the RPC roster as the fatal roster dependency.
   - Keep existing `useTeamMembers` / `useSkipLevelTeamMembers` only where they are still needed for counts or as a non-fatal fallback, or replace direct/skip counts from the RPC relationship field.
   - Do not let auxiliary profile/stage/KPI errors blank the roster.

5. **Make the fatal error diagnostic actionable**
   - If the RPC fails, show a technical-safe error context in the existing diagnostic, e.g. “Team roster service failed,” while keeping user-facing wording concise.
   - Avoid exposing secrets or raw tokens.

6. **Regression tests and mock data**
   - Add/update tests proving manager Team Reviews uses the new RPC roster source as the fatal dependency.
   - Test success path with 13 direct reports and skip-level rows.
   - Test failure path where auxiliary KPI/profile queries fail but roster still renders.
   - Test RPC grants/function definition text where practical.

7. **DOCUMENTATION.md updates**
   - Add version history entry documenting the manager Team Reviews roster source change.
   - Document the RPC boundary, auth gating, and why browser-side direct/skip `profiles` queries are no longer the fatal source.

8. **POLICY.md updates**
   - Update the Team Reviews roster policy section: non-full-access manager roster is resolved server-side, active users only, direct + skip-level relationship tagged, auxiliary KPI stat failures are non-fatal.

## UI Changes
- **Location:** Team Reviews page, Team Members panel.
- **Visual change:** No redesign. The list should render employees instead of the centered fatal error.
- **Interaction impact:** Retry/Refresh still works; filters and pagination stay the same.
- **Responsiveness:** No layout changes; existing responsive grid/list behavior remains.

## Implementation
- Pending your approval. No files will be edited until approved.

## Tests
- Add/update Vitest coverage for the new roster source and fallback/error behavior.
- Run only targeted tests relevant to Team Reviews roster loading.

## DOCUMENTATION.md updates
- Will be updated in the same implementation step.

## POLICY.md updates
- Will be updated in the same implementation step.

## Post-implementation notes
- After approval and implementation, I will verify the exact signal that matters: Team Reviews should no longer enter `rosterDataError` when Sajid’s backend roster exists.

<presentation-actions>
  <presentation-open-history>View History</presentation-open-history>
</presentation-actions>
<presentation-actions>
<presentation-link url="https://docs.lovable.dev/tips-tricks/troubleshooting">Troubleshooting docs</presentation-link>
</presentation-actions>