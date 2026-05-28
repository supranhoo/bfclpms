### Risk & Impact

- **Data Impact**: Read-only. No schema, RLS, or policy change.
- **Workflow Impact**: New assignments still restricted to active employees (core rule preserved). Only the **display lookup** is broadened.
- **UI Impact**: Existing rows that previously read "Unknown" will now show the correct name + employee code with an `Inactive` badge when applicable. Search dropdown gains an explicit "Show inactive employees" toggle (off by default) so admins can re-assign someone who was deactivated by mistake.
- **Regression Risk**: Low. Two isolated `useQuery` hooks replace one; enrichment map is built from the union.
- **Mitigation**: Keep `is_active=true` as the default filter on the picker; only the display lookup ignores it.

### Changes (single file: `src/components/admin/AccessProfilesManager.tsx`)

1. Replace the single `profiles-for-access-assignment` query with two:
   - `profiles-active-for-assignment` — `is_active = true`, drives the search picker (unchanged behavior).
   - `profiles-all-for-assignment-display` — no `is_active` filter, light columns (`id, full_name, employee_code, email, is_active`), used **only** for enrichment of the existing assignments table.
2. Build a single `Map<id, profile>` from the union for `enrichedAssignments` so already-saved rows always resolve a name. Keep the `'Unknown'` fallback as a last resort (orphaned user_id only).
3. Add an `Inactive` badge in the assignments table next to the employee name when `profile.is_active === false`.
4. Add a small "Include inactive" checkbox above the search input. When checked, the picker draws from the all-profiles set; otherwise stays active-only.
5. Sort search results so active employees come first when "Include inactive" is on.

### Why two queries (not one client-side filter)

The active-only list is reused by other React Query consumers via key `profiles-active-for-assignment` and stays cache-hot. The all-profiles set is a separate, narrowly-scoped cache used only here, so we don't expand the surface of any other hook that assumes `is_active=true`.

### Tests / Verification

- Manual: search a known inactive employee with the toggle off → "No results"; toggle on → appears with an `Inactive` chip; previously-assigned rows now show the real name.
- Existing `enrichedAssignments` behavior preserved for active employees.

### Docs / Memory

- No DOCUMENTATION.md / POLICY.md change required — this is a display fix, not a policy change. Core rule "filter out `is_active: false` users" still holds for the assignment action; display lookup is an exception explicitly opted in via the toggle.

### Out of scope

- Server-side search/pagination of the picker (would be a separate scalability ticket).
- Auto-cleanup of assignments whose `user_id` no longer exists in `profiles`.
