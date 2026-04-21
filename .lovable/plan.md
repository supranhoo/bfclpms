

## Explore — Auditor "Explorer / Read-Only" Mode

### TL;DR
**This already partially exists.** The Audit panel has an `All Employees (Cross-Check)` filter that shows every active employee regardless of audit scope. The gaps are:

1. **Discoverability** — it's hidden inside the Status dropdown. Auditors don't know it exists.
2. **Read-only enforcement in the scorecard** — when an auditor opens an out-of-scope employee from cross-check, the scorecard does not visibly switch to a read-only mode. RLS blocks writes server-side, but the UI still renders the auditor edit fields, which is confusing and looks like a bug.
3. **No explicit "exploration intent"** — there's no banner/badge telling the auditor "you are viewing out-of-audit scope, in observe-only mode."

The existing process (audit assignments, queries, observations, scoring on assigned KPIs) is **not interrupted** — Cross-Check already routes through the same scorecard, just without write capability.

### What to build

#### 1. Promote "Explorer Mode" as a first-class toggle (not a hidden status filter)
Add a prominent **"Explore All Employees"** toggle pill at the top of the Audit dashboard, next to the view title. When ON:
- Status filter auto-switches to `cross_check` (we keep the existing logic — zero risk).
- An amber "Explorer Mode (Read-Only)" badge appears in the header.
- The Status dropdown itself is hidden (it has no meaning when browsing all employees).
- The diagnostic line shows "Browsing all 2,533 active employees — read-only".

```text
┌─ Audit Panel ──────────────────────────────────────────────┐
│  March 2026 ▼   [🔍 Explore All Employees: ◉ ON]   [+ Filters] │
│  ⚠ Explorer Mode (Read-Only) — viewing employees outside   │
│     your assigned audit scope                              │
└────────────────────────────────────────────────────────────┘
```

Toggling OFF returns the auditor to their normal scope (default `all` status filter, assignments visible, scoring enabled where in-scope).

#### 2. Enforce read-only state in the scorecard for explorer mode
When an employee is opened from explorer mode (cross-check), pass `exploreMode={true}` into `UnifiedScorecard` and `KpiReviewPanel`. This:
- Hides the **Auditor Score** input fields, **Save**, **Send Back**, **Forward** buttons.
- Replaces them with a read-only banner: *"You are viewing this employee in Explorer Mode. Scoring, queries, and workflow actions are disabled. Switch off Explorer Mode to act on assigned employees."*
- Allows: viewing all scores (Self / Manager / Skip / HR PMS / Auditor / Management / Final), viewing the journey timeline, viewing evidence, viewing observations & queries.
- Disables: writing observations, raising queries, marking N/A, sending back, scoring, downloading evidence (configurable — default ON, since auditors can already download from in-scope).

#### 3. Make the entry point obvious — sidebar mini-link
Under "Audit Panel" in the sidebar, add a sub-item: **"Explore Employees (Read-Only)"** → `/dashboard?view=audit&explore=1`. Same destination as the toggle, just discoverable from the sidebar.

#### 4. Tooltip + telemetry-light log entry
Hover tooltip on the toggle: *"Browse all employees in the organization in read-only mode. Useful for cross-checking ratings outside your assigned audit scope."* Each time an auditor opens a scorecard in Explorer Mode, write a `kpi_audit_log` entry `EXPLORER_VIEW` (performed_by = auditor, kpi_id, period). Lightweight, satisfies the "Audit Trail" project rule.

### Files Touched

| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Add `Explore All` toggle in audit view header; wire to `statusFilter='cross_check'`; show amber Explorer banner; hide Status dropdown when on; pass `exploreMode` down to the opened scorecard. |
| `src/components/review/UnifiedScorecard.tsx` | Accept `exploreMode?: boolean` prop. When true, hide auditor edit inputs + workflow action buttons, show read-only banner, disable observation/query mutations. |
| `src/components/review/KpiReviewPanel.tsx` | Same — pass-through of `exploreMode`, gate the panel actions. |
| `src/components/layout/AppSidebar.tsx` | Add "Explore Employees (Read-Only)" sub-link under Audit for `auditor` + `admin` roles. |
| `src/pages/Dashboard.tsx` | Read `?explore=1` URL param → set initial `statusFilter='cross_check'` and `exploreMode=true`. |
| Edge function / DB | None needed — RLS already blocks any unintended writes. Optional: `kpi_audit_logs` insert from client for `EXPLORER_VIEW` (no schema change). |
| `DOCUMENTATION.md` | v2.65.0 — Auditor Explorer Mode (read-only org-wide browsing). |
| `mem://features/review/auditor-access-expansion` | Append: "Explorer Mode = first-class toggle in Audit view; enforces UI read-only on top of existing RLS gates; logs `EXPLORER_VIEW` to audit log per opened KPI." |

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None. All writes already gated by RLS. New `EXPLORER_VIEW` audit log inserts are append-only, no business data. |
| Workflow | None. Auditors' assignment-based scoring path is untouched; Explorer Mode is a separate UI mode. |
| RLS | No changes. Existing `audit`-stage policies already prevent out-of-scope writes — we're just aligning the UI. |
| Existing process | Zero interruption. Default landing on Audit panel = current behavior (assignments first). Explorer is opt-in. |
| Performance | Same as today's Cross-Check — uses already-cached `allProfiles` query. |
| Regression risk | Low. Adds a UI toggle + a `exploreMode` boolean prop. No state machine changes, no permission changes. |
| Test matrix | (a) Auditor logs in → sees "Audit Panel" with assignments as today. (b) Toggles "Explore All" → sees all 2,533 employees, amber banner, status dropdown hidden. (c) Opens Sanjeeb 101178 → scorecard renders all stage scores, no auditor input fields, banner says read-only. (d) Tries to raise query/observation → buttons disabled with tooltip. (e) Toggles OFF → returns to normal Audit panel, full scoring restored on assigned. (f) Sidebar link `/dashboard?view=audit&explore=1` lands directly in Explorer Mode. (g) Audit log shows `EXPLORER_VIEW` entries. |

### Out of Scope
- Adding an Explorer Mode for non-auditor roles (HR PMS / Management already have org-wide access via their normal flows).
- Persisting Explorer Mode across sessions (URL param + toggle is enough).
- New filters specific to Explorer Mode (the existing demographic + period + search filters already work).
- Bulk export of scores from Explorer Mode (separate Reports feature already covers this).

