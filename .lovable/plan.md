## Two unrelated bugs from the same screenshot

### Issue 1 — Ankan: red "Profile no longer exists" toast still appears even though save succeeded (ADR-063)

**RCA**
- The DB-side fix (ADR-062, normalized RLS helper) is verified: `is_org_kpi_data_owner_for_profile` now grants Ankan visibility to 76 distinct mapped profiles, and the specific "Completion of Mandated Training Hours" KPI returns 55 active mapped rows for May 2026.
- The visibility-aware "visible-missed vs hidden-missed" split that we added in the previous turn was added **only to the propagate path** in `executeSaveAndPropagate`. The earlier Save path (`handleCardSave`, lines 585–603) still emits a single destructive toast for *every* `employee_id` not present in the local `allProfiles` set — including the benign case where those profiles are simply outside the data-owner's RLS window (e.g. employees mapped to *other* KPIs picked up by the propagation preview, or a brief cache desync after the policy migration).
- That stale-by-design destructive toast is exactly what Ankan is seeing now; it is not blocking the save (the visible 27/27 are persisted), but it's misleading and identical in copy to a real corruption case.

**Fix**
1. In `src/pages/admin/OrgKpiDataEntry.tsx::handleCardSave`, mirror the propagate-path split:
   - `visibleMissed` (employee_id in `allProfiles` ∩ not in profile fetch) → keep the existing destructive toast (real RLS / FK gap).
   - `hiddenMissed` (employee_id mapped via the org-KPI signature but absent from `allProfiles`) → emit a single neutral/info toast: *"X mapped employee(s) outside your visibility scope were skipped — they will be entered by an Admin or another data owner."* (No `variant: 'destructive'`.)
2. Detect the "all skipped rows are hidden" case and suppress the destructive toast entirely.
3. Add `mappedEmpIdsByKey` (already on the orgLevelData hook) to the dependency list so the split can use the authoritative mapping rather than re-deriving from `toSave`.

**Regression guard**
- New unit test `src/test/orgKpiSaveHiddenMissedToast.test.ts`: feeds a save payload with one orphan + one RLS-hidden id and asserts (a) only the visible row hits `bulkUpsert`, (b) the destructive toast fires only when there's a truly visible orphan, (c) the hidden-only case fires the neutral toast.
- Add row to `mem://features/admin/org-kpi-management-suite` (point 21) and append ADR-063.

### Issue 2 — Vivek (Admin) sees 0 employees on Team Reviews

**Investigation needed before patch (read-only — no code changes yet):**
1. Add a one-shot diagnostic console log in `EmployeeSelectorGrid` (`useEffect` on mount) that prints: `role`, `isFullAccess`, `viewLevel`, `allProfiles?.length`, `teamMembers?.length`, `skipLevelMembers?.length`, `requiredStage`, `statusFilter`, and the resolved `baseMembers?.length`. This will tell us in one preview reload whether:
   - the role isn't resolving to `admin` (Admin View toggle vs natural role mismatch — see `mem://features/admin/admin-role-switch`), OR
   - `useProfiles()` is returning empty for Admin View (RLS regression from the recent profiles policy work), OR
   - `requiredStage` / `statusFilter` is silently zeroing the list.
2. Once the log identifies the failing branch, apply the targeted fix:
   - **If role-switch related:** ensure `useUserRole` returns `admin` while Admin View is ON regardless of natural role mask.
   - **If `useProfiles` empty under admin RLS:** verify the `Admins can view all profiles` policy still evaluates true; check whether the recent migration churn dropped/replaced it.
   - **If filter related:** reset `statusFilter` default for `team` viewLevel.
3. Remove the diagnostic log after the fix lands.

**Regression guard (after RCA confirmed):**
- Targeted unit test in `src/test/teamReviewsAdminVisibility.test.ts` that mocks role=admin + non-empty `allProfiles` and asserts `baseMembers.length > 0` for `viewLevel='team'`.

### Risk & Impact

| Area | Issue 1 | Issue 2 |
|------|---------|---------|
| Data | None (toast copy / classification only) | None until fix scope known |
| Workflow | Removes false-alarm error for data owners | Restores admin Team Reviews access |
| RLS | No DB change | Possible RLS audit if `useProfiles` is the culprit |
| Regression | Low — same predicate already proven in propagate path | Diagnostic phase first, then surgical fix |

### Files

**Issue 1 (immediate):**
- `src/pages/admin/OrgKpiDataEntry.tsx` — refactor orphan split in `handleCardSave`
- `src/test/orgKpiSaveHiddenMissedToast.test.ts` (new)
- `docs/adr/ADR-063.md` (new)
- `CHANGELOG_2026.md`, `mem/features/admin/org-kpi-management-suite`

**Issue 2 (diagnostic first):**
- `src/components/review/EmployeeSelectorGrid.tsx` — temporary `console.log` block (removed after RCA)
- Follow-up patch + test once the failing branch is confirmed in the next preview reload.
