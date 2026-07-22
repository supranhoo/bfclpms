## Current state (verified)

The `pending_with` column already exists in `KpiScorecardDetail.tsx` (default field, sort 295) and is included in both single-month (`handleExport`) and range (`handleRangeExport`) XLSX exports via the shared `ksdValueFor` mapper — UI/Excel parity is already guaranteed row-by-row.

The gap is in `src/lib/kpiPendingWith.ts`: for the `hr_pms_review`, `audit`, and `management_review` stages, it currently returns queue **labels** (`"HR PMS"`, `"Audit"`, `"Management"`) instead of the actual person names, as the user is now requesting.

## Scope

Show person names for every stage in Pending With (Name):

| Next stage           | Show                                                          |
| -------------------- | ------------------------------------------------------------- |
| kra_set (individual) | Employee name (unchanged)                                     |
| kra_set (org KPI)    | Data Owner name(s) (unchanged)                                |
| self_review          | Reporting Manager name (unchanged)                            |
| manager_check        | Reporting Manager name (unchanged)                            |
| skip_level_check     | Skip-Level Manager name (unchanged)                           |
| **hr_pms_review**    | **HR PMS user name(s)** — comma-joined, from `user_roles`     |
| **audit**            | **Assigned Auditor name** for this KPI (from assignments), else all auditors |
| **management_review**| **Management user name(s)** — comma-joined, from `user_roles` |
| approved             | `"Completed"` (unchanged, via `displayPendingWith`)           |
| is_na                | `"N/A"` (unchanged)                                           |
| Unresolvable         | Em-dash `—` (unchanged fallback)                              |

## Implementation

1. **`src/lib/kpiPendingWith.ts`** — extend `ResolvePendingWithInput` with three optional string fields: `hrPmsNames`, `auditorNames`, `managementNames`. In `labelForNext`, prefer the resolved name(s) for `hr_pms_review`/`audit`/`management_review` and fall back to the existing queue labels only when unresolved. Keep manager/skip-level behavior unchanged. All strings pre-joined by the caller — resolver stays pure.

2. **`src/pages/reports/KpiScorecardDetail.tsx`** — in `fetchScorecardForPeriod`:
   - After fetching `profiles`, fetch role members once from `user_roles` for `role in ('hr_pms','management')`, join names via `profileMap`, and pre-join to `hrPmsNamesGlobal` / `managementNamesGlobal` strings.
   - Fetch per-KPI auditor assignments from `audit_kpi_level_assignments` in 500-id chunks (matches existing `WF_CHUNK` pattern used elsewhere in the file), build `kpiIdToAuditorNames: Map<string, string>` via `profileMap`. When a KPI has no assignment, fall back to the global auditor pool (all users with role `auditor`) — pre-joined once.
   - Pass these three name strings into every `resolvePendingWith(...)` call (per-KPI auditor lookup, shared global HR PMS / Management strings).
   - No changes to the `FlatRow` shape beyond the already-existing `pendingWith` string — export and UI both read `displayPendingWith(r)` unchanged, so Excel parity is preserved automatically.

3. **Filtering, sorting, search** — already wired against `displayPendingWith(r)` and the `pendingWithFilter` popover; no changes needed. The column-filter popover values will just now list real names for those stages.

4. **Tests** — extend `src/test/kpiPendingWith.test.ts` with three cases (hr_pms next → HR PMS user name; audit next → assigned auditor name; management next → management user name), plus fallback-to-label when names are empty. Existing 30 tests remain green.

## What does NOT change

- No column added or removed (Pending With already exists).
- No change to `KSD_DEFAULT_FIELDS`, `ksdValueFor`, `toExportRecord`, `handleExport`, `handleRangeExport`, or the "Pending With Summary" sheet.
- No RLS, migration, or backend change — reads use existing tables (`user_roles`, `audit_kpi_level_assignments`, `profiles`).
- No policy/status semantics change — only the *display label* for three reviewer stages becomes an actual name.

## Risk & Impact

- **Data**: read-only, additive lookups. Batched by 500 to respect the existing pagination policy for large workspaces.
- **Regression**: pure display change; queue-label fallback preserved if a role has zero members or an assignment is missing.
- **UI/UX**: consistent with all other stages already showing person names; column filter now surfaces real people, which is the intent.
- **Performance**: two small `user_roles` scans + one chunked `audit_kpi_level_assignments` fetch per load — comparable to the existing manager/skip-level fetches.

## Docs

Update `POLICY.md` (Pending With rule) and add a short ADR entry noting queue-label → person-name resolution and the assignment/role fallback order.
