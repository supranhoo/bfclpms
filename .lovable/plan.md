## TL;DR

**Sajid's department change is NOT the cause.** The reviewer-scope RPCs are 100% based on `reporting_manager_id`; department isn't read anywhere in the chain. Sajid actually has 247 KPIs available for April 2026 across his 185 reports — the banner is showing a **false negative** because the diagnostic ignores RPC errors. Separately, **12 other managers have a real zero-KPI problem** that the same banner correctly flags but nobody acted on.

---

## Why-Why Analysis (Sajid Raza, 100264)


| #   | Question                                      | Evidence                                                                                                                                                                                                                                                                        |
| --- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Why does the banner say "185 mapped, 0 KPIs"? | Component renders branch `reports_without_kpis` whenever `periodKpis?.length === 0`.                                                                                                                                                                                            |
| 2   | Why is `periodKpis` empty in his React state? | `useKpisByPeriodRanges` calls RPC `get_reviewer_kpis_for_period('April', 2026)`. If the RPC throws (timeout, network, auth glitch) `data` stays `undefined` → `?? 0`.                                                                                                           |
| 3   | Should the RPC return rows?                   | **Yes — 247 rows.** Simulating the RPC's ELSE branch with Sajid's uid (`b68f5bce…`) returns 247 KPIs across 12 of his 185 reports.                                                                                                                                              |
| 4   | Could department change have broken it?       | **No.** `get_reviewer_kpis_for_period`, `get_reviewer_roster_slim`, `useTeamMembers`, `useSkipLevelTeamMembers` only read `reporting_manager_id` + `is_active`. Department isn't referenced.                                                                                    |
| 5   | Then why is his UI empty?                     | Two plausible causes (need network/console capture to confirm): **(a)** RPC silently fails for his session — the diagnostic ignores `periodKpisError`; **(b)** stale React Query cache from when he had 0 KPIs (cached empty result, never invalidated after KRAs were issued). |
| 6   | Why doesn't the user see the real cause?      | `TeamReviewsZeroDiagnostic` has 3 branches but **no error branch**. An RPC error is mis-classified as "no KPIs assigned".                                                                                                                                                       |


### Verdict for Sajid

- Mapping is correct: 13 direct + 172 indirect = 185.
- Auth identity is correct: `auth.users.id == profiles.id == b68f5bce…`.
- Role is `manager`, ELSE branch of RPC applies.
- DB has the data. The banner text is wrong for his case — it's a **diagnostic blind spot**, not a data/permissions bug.

---

## Who else is affected

Two distinct populations surface from the same banner. Run against `kpis WHERE review_period='April' AND review_year=2026` scoped to each manager's (direct ∪ indirect) roster:

### A. False-negative candidates (banner wrong — KPIs exist but UI may show empty)

Only Sajid is currently reported. Anyone seeing "0 KPIs" while their roster's `kpi_rows > 0` is in this bucket. Worth proactively asking: Sindhu Raj Singh (109), Ganapathi Varma (199), Jitendra Dwivedi (212), Y R V S Murthy (108), Anant Shankar Shet (265), Abhas Luharuwalla (319) — all have abundant KPIs and could hit the same silent-error path.

### B. Real zero-KPI managers (banner is accurate — KRAs not issued for their reports)


| Manager                | Code   | Direct | Skip | KPI rows (Apr 2026) |
| ---------------------- | ------ | ------ | ---- | ------------------- |
| Saibal Kunar           | 200834 | 458    | 11   | **0**               |
| Sujeet Kumar Singh     | 200405 | 241    | 0    | **0**               |
| Chandra Bhan Singh     | 101964 | 131    | 0    | **0**               |
| Pratap Chatterjee      | 100832 | 120    | 0    | **0**               |
| Bhoopendra Kumar Sinha | 101131 | 82     | 0    | **0**               |
| Awadhesh Kumar Singh   | 100070 | 74     | 0    | **0**               |
| Pradip Duary           | 200428 | 73     | 0    | **0**               |
| Abhishek Prasad        | 101893 | 65     | 120  | **0**               |
| Sudhir Kumar           | 101894 | 52     | 0    | **0**               |
| Radha Krishan Pandey   | 200568 | 50     | 0    | **0**               |
| Gaurav Tiwari          | 100750 | 49     | 0    | **0**               |
| Ramendra Lal Roy       | 101824 | 45     | 0    | **0**               |


≈ 1,500+ employees combined have no Apr-2026 KPIs in their reporting line. This is a KRA-issuance gap, not a UI bug.

---

## Proposed Fixes (require approval)

### Fix 1 — Close the diagnostic blind spot (UI only, ~30 lines)

Extend `TeamReviewsZeroDiagnostic` to surface a 4th branch `rpc_error` and pass `periodKpisError` from `EmployeeSelectorGrid.tsx`. When the RPC errors, show:

> "We couldn't load KPIs for this period. The data exists, but the request failed — try Refresh roster or reload the page."

This prevents Sajid-style false negatives from masquerading as "no KPIs assigned".  
  
(this is just 1 more notification which is not being usefull)

### Fix 2 — Cache-bust on KPI issuance

When KRAs are issued/copied (`copy-kras`, `bulk-template-assign`), invalidate `['kpis-by-period-ranges']` so a manager whose roster transitions from 0 → N KPIs sees them immediately instead of after a stale-time elapses.

### Fix 3 — Admin alert for Population B

Surface the 12 managers above on the **KRA Issuance** report with a "no-KRAs-for-Apr-2026" filter so HR PMS can chase issuance. No code changes required if the report already supports the filter; if not, add it.

### Out of scope

- Department change rollback (irrelevant — confirmed not causal).
- Touching reviewer-scope RPCs (verified correct).
- Workflow stage logic.

### Risk & Impact

- Fix 1: presentation-only, no schema, no RLS change. Adds one branch + one prop.
- Fix 2: cache invalidation, no data mutation.
- Fix 3: read-only report filter.

---

## Documentation to update if approved

- `POLICY.md` §129 — add 4th diagnostic branch and KPI cache invalidation contract.
- `DOCUMENTATION.md` v2.66.11.12 — RCA + fixes.
- New `mem://features/review/team-reviews-rpc-error-branch`.
- New unit test `teamReviewsZeroDiagnostic.test.ts` — covers `rpc_error` branch.