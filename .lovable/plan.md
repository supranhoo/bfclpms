## RCA: NULL-status fix + "Self appears in Manager's Team tab"

### Part 1 — Is BUG-035 (NULL status) fully fixed?

**Yes — landed and verified:**
- `UnifiedScorecard.tsx` has `assertResolvableStatus()` blocking NULL writes (line 703).
- `MobileKpiCard.tsx` (dashboard + review), `MobileSelfReviewCard`, `SelfReviewSheet`, `KpiDetailsTable` all render the amber **"Status Missing"** badge instead of silently falling back to "KRA Set".
- Repair migration ran for the 8 affected March 2026 KPIs.
- Regression tests `BUG-035` present in `bugBountyFixes.test.ts` (68/68 passing).
- POLICY §106 (No-NULL-Status Invariant) and DOCUMENTATION v2.66.7.37 in place.

**However**, the protective UI gate has one remaining gap: `EmployeeSelectorGrid` does not yet block reviewers from *opening* employees whose workflow excludes the reviewer's stage — the runtime guard only fires when the reviewer tries to forward. We should harden this to prevent the toast appearing in the first place. (Tracked below as part of Part 2's fix because both share the same view-gating logic.)

---

### Part 2 — Why does **Self** show in the **Manager / Team** tab?

**Root Cause (code-level, confirmed):**

In `src/components/review/EmployeeSelectorGrid.tsx` (lines 363–388), the `team` view branches on `isFullAccess`:

```ts
const isFullAccess = role === 'admin' || role === 'auditor' || role === 'management' || role === 'hr_pms';

if (viewLevel === 'team') {
  if (isFullAccess) {
    // returns ALL profiles, tagged direct/indirect/undefined
    return allProfiles?.map(...);
  }
  // managers: direct + skip-level merged
  return [...directTagged, ...indirectTagged];
}
```

Findings:
1. **Full-access roles (admin/management/hr_pms/auditor)** acting through the Team tab see the **entire `allProfiles` list**, which includes their own profile — there is no `p.id !== profile.id` filter.
2. **Pure managers** go through `useTeamMembers` (`reporting_manager_id = managerId`) — DB query confirmed no self-reporting loops exist (`SELECT … WHERE reporting_manager_id = id` returned 0 rows). So a regular manager only sees self if they are *also* admin/management (which matches the current session: admin acting as manager on `/dashboard?view=team`).
3. The skip-level branch (`useSkipLevelMembers`) also does not explicitly exclude the viewer — a 2-hop reporting chain that loops back would surface self, but no such loops exist today.

**Conclusion:** The bug is real for any user with a full-access role (admin, management, hr_pms, auditor) viewing the Team tab. It is also a latent risk for pure managers if a self-reporting loop is ever introduced.

---

### Fix Plan

**1. Universal self-exclusion in `EmployeeSelectorGrid`**
- After computing `baseMembers`, filter out the current viewer: `members.filter(m => m.id !== profile.id)`.
- Apply unconditionally across all view levels (`team`, `audit`, `management`, `hr_pms`, `skip_level`, `pending_*`, and cross-check) — a reviewer should never review themselves through a reviewer panel; the `Self` tab is the canonical surface for that.
- Adjust `stats.totalEmployees` / `Team Size` counters so the excluded self is not double-counted.

**2. Hook-level safety net**
- In `useTeamMembers` and `useSkipLevelMembers` (`src/hooks/useOrganization.ts`), add `.neq('id', managerId)` so even a corrupt self-loop in `reporting_manager_id` cannot leak self into team lists.

**3. Tighten reviewer-stage gating (closes BUG-035 residual gap)**
- In `EmployeeSelectorGrid`, when `requiredStage` is set, ensure `stageFilteredProfiles` is the SOLE source for non-cross-check reviewer tabs (already true). Add an assertion in `handleSelectEmployee` that the selected employee's resolved workflow contains the reviewer's stage; otherwise show a toast: *"This employee's workflow does not include your review stage."*

**4. DB integrity check (defensive)**
- Add a CHECK-style validation **trigger** on `profiles` (per workspace policy: triggers, not CHECK constraints) preventing `reporting_manager_id = id`. Raises descriptive error.

**5. Regression Tests — `BUG-036`**
Add to `src/test/bugBountyFixes.test.ts`:
- `EmployeeSelectorGrid` source must contain a self-exclusion filter (`m.id !== profile.id`) covering Team/Audit/HR PMS/Management views.
- `useTeamMembers` and `useSkipLevelMembers` must include `.neq('id', managerId)`.
- Trigger migration creates `prevent_self_reporting_manager()` and rejects `UPDATE profiles SET reporting_manager_id = id`.

**6. Policy & Documentation Sync**
- POLICY.md **§107 — Reviewer Self-Exclusion**: "No reviewer panel (Team, Audit, HR PMS, Management, Skip-Level, Pending-*) may surface the viewer's own profile. Self-assessment lives exclusively under the Self tab."
- DOCUMENTATION.md → bump version (v2.66.7.38) with changelog entry.
- New mem entry: `mem://features/review/reviewer-self-exclusion`.
- Update `mem://index.md` Core line: "Reviewers never see themselves in any reviewer grid."

---

### Risk & Impact Report

| Area | Impact | Mitigation |
|---|---|---|
| Data | None — UI-only filter + a defensive trigger. No historical KPI data altered. | Trigger only blocks future invalid writes. |
| Workflow | Admins/management/HR PMS lose the ability to "review themselves via Team tab" — intentional; they still use the Self tab. | POLICY §107 documents this. |
| UI/UX | `Team Size` count drops by 1 for full-access viewers. | Recompute counters; label remains accurate ("Team Size" excludes self). |
| Regression | Low — change is additive `.filter(...)` + `.neq(...)`. | BUG-036 tests cover both paths. |

---

### Files to be edited

- `src/components/review/EmployeeSelectorGrid.tsx` — self-exclusion filter, stat recompute, stage-gate assertion.
- `src/hooks/useOrganization.ts` — `.neq('id', managerId)` in team/skip-level hooks.
- `supabase/migrations/<ts>_prevent_self_reporting_manager.sql` — validation trigger.
- `src/test/bugBountyFixes.test.ts` — BUG-036 suite.
- `POLICY.md`, `DOCUMENTATION.md`, `mem/index.md`, `mem/features/review/reviewer-self-exclusion` (new).
