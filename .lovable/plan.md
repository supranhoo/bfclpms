

## RCA: Why employee 101178 (Sanjeeb Kumar Jena) is "not showing" in HR PMS

### What's actually happening — confirmed from data

| Check | Result |
|---|---|
| Employee exists, active, has portal access | ✅ Yes (`is_active=true`, `portal_access=true`) |
| Workflow includes `hr_pms_review` stage | ✅ Yes — `get_bulk_employee_workflows` returns `[..., hr_pms_review, approved]` for both Jan 2026 and Apr 2026 |
| Present in `stageFilteredProfiles` (HR PMS pool) | ✅ Yes — included in the 1956th alphabetical slot of 2533 active employees |
| Has KPIs in the selected period (January 2026) | ✅ Yes — **27 KPIs, all already `approved`** |

So the employee IS in the underlying list. The bug isn't visibility — it's **discoverability due to urgency-based pagination ordering**.

### Root cause — urgency sort + 24-per-page pagination push "fully reviewed" employees to back pages

`EmployeeSelectorGrid.tsx` lines 664–676 sort `displayMembers` by:

1. Employees with `total = 0` KPIs → bottom
2. **`badge1` (pending count) DESC → most pending first**
3. `total` DESC
4. Alphabetical

For Sanjeeb in HR PMS view (Jan 2026):
- `badge1 = 0` → no KPIs pending HR PMS review
- `badge2 = 0` → none currently at `hr_pms_review`
- `badge3 = 27` → all approved (already past HR PMS)

So he is sorted **below every employee with even 1 pending HR PMS item**. With ~2533 active employees and pageSize default = 24, he ends up roughly on page 80+. The user looks at page 1, doesn't see him, concludes "not showing".

### Why this only surfaces now

- Before v2.64.2, the grid rendered everyone, so a Ctrl+F or scroll worked.
- After v2.64.2 introduced 24-per-page pagination, "completed" employees became invisible without paging or searching.
- Search by `101178` would still find him (the search filter operates on the full set first), but the user did not search this code in this session — session replay shows searches for `ankit`, `10`, `101785`, then a clear.

### Why sort isn't wrong, but discoverability is

The urgency sort is intentional (per `mem://features/review/reviewer-grid-progress-and-prioritization`) — reviewers should see pending work first. But there is no UI affordance telling the user "you are on page 1 of 106; the employee you're thinking of has nothing pending and is on page 87". The result: false negative ("not showing") instead of "no action needed".

### Proposed fix — Three small UX changes

**1. Status filter pill that explains what page 1 contains**
Above the grid, add a contextual pill: `"Showing page X of Y — sorted by most pending first. Employees with no pending HR PMS items appear on later pages."` Visible only when `statusFilter === 'all'` AND there are >1 pages of results AND there are completed employees on back pages.

**2. Add "Reviewed" quick-jump indicator**
Show a small note in the empty-state on later pages OR a one-click button `"Jump to fully reviewed employees (page X)"` that scrolls to the first page where `badge1 = 0` employees begin.

**3. (Primary fix) Improve the search affordance + page reset**
When the user searches and finds 0 matches, also surface: `"Searched only the current page-set — search now scans all 2,533 employees"`. We already do scan the full set, but the message should make this explicit.

The single highest-impact change: **option 1 + a visible "X of Y" page count with a "Show fully reviewed" tab**. This solves the "not showing" misperception immediately without changing data flow.

### Files Touched

| File | Change |
|---|---|
| `src/components/review/EmployeeSelectorGrid.tsx` | Add explanatory pill above grid when `statusFilter==='all'`, multi-page, and reviewed employees exist; add `"Show only Reviewed"` quick-link that sets `statusFilter='reviewed'`; ensure existing pagination footer shows `"Page X of Y · Z employees"` text prominently |
| `DOCUMENTATION.md` | Version History entry v2.64.5 — Discoverability hint for completed reviewers |
| `mem://features/review/reviewer-grid-progress-and-prioritization` | Append: "Urgency sort + pagination requires explicit UX hint that reviewed employees move to back pages; search/`statusFilter='reviewed'` are the discovery paths" |

No DB / RLS / workflow changes. No data correctness change.

### Risk & Impact

| Area | Impact |
|---|---|
| Data | None |
| Workflow | None — sort and filter logic unchanged |
| UI | Adds one info pill + one quick-link button above grid; pagination footer text refined |
| Regression | Very low. Pure additive UI elements, gated on `statusFilter==='all'` + multi-page + reviewed-count > 0 |
| Mitigation / test | (a) HR PMS as Admin → see pill + "Show Reviewed" button; click button → filter changes, Sanjeeb 101178 appears (b) Search "101178" with no filters → he appears on page 1 of search results (c) Manager view (only 5 reports) → pill hidden because not multi-page (d) Mobile viewport → pill wraps cleanly |

### Out of Scope
- Changing the urgency sort algorithm
- Removing pagination (defeats the v2.64.2 perf fix)
- Adding a "Sort by" dropdown (separate enhancement; can revisit if requested)
- Server-side filter/pagination

