## What's actually wrong

For Jaspal (101125) the master data on the RCA card is correct in the DB (Dept `HR-Human Resources`, BU `HR`, Division `Support Function`, Grade `GM-President`, DOJ `2025-04-15`, RM `Dummy`, Active/Confirmed). What is *missing* on screen is the **rest of the review detail** — Self / HOD / BU / Management / HR scores, ratings, comments, current stage, pending-with, days pending, HR data diagnosis, root cause, evidence, impact and recommended fix.

Those 32 fields are already assembled in `ComprehensiveTab.tsx` (lines 166–200), but they're rendered as **one very wide horizontally-scrolling table row** with `whitespace-nowrap max-w-[240px] truncate`. The screenshot shows only the first 9 columns because the rest are behind the horizontal scrollbar and each cell is truncated. On top of that, for Management-terminal cases (ADR-138 / ADR-151) the row still labels the terminal reviewer as "HR" / "BU Head" instead of "Management", which reads as incorrect data.

## Fix (UI only — no schema, no policy change)

**File:** `src/components/reports/annual-review/ComprehensiveTab.tsx` (lines 138–215 only; nothing else touched.)

1. Replace the single-row `<Table>` inside the RCA card with a responsive **key–value grid** (`grid-cols-1 md:grid-cols-2 xl:grid-cols-3`) so every one of the 32 fields is visible on one screen without horizontal scroll or truncation. Each cell shows the label (muted, small) above the value (foreground, wraps freely). Long comments wrap; badges (Root Cause) stay inline.
2. Group the cells into four visual sections with subtle dividers, in this order:
   - **Employee** — Code, Name, Designation, Department, Business Unit, Division, Grade, Date of Joining, Eligibility
   - **Stage scores** — Self, HOD, BU Head, Management, HR (score + rating + comment for each stage that exists on the instance)
   - **Outcome** — Final Score, Final Rating, Current Stage, Pending With, Completion Status, Days Since Update
   - **Diagnosis** — HR Data Available, HR Data Visible in Report, Root Cause (badge), Evidence, Impact, Recommended Fix
3. **Stage-aware labels.** When `r.enabled_stages` (already on `ComprehensiveRow`) does not include `dept_head` / `bu_head` / `hr`, hide those rows instead of showing "—". When the terminal stage is `management`, add a "Management Score / Rating / Comment" triplet driven by `r.management_score` / `r.management_comment` (falling back to `bu_head_*` if the field name differs — will confirm in `comprehensiveReport.ts` before wiring). This makes Jaspal's row show **Self → Management** with real values instead of empty HOD/BU/HR placeholders.
4. Keep the existing search input, `diagnoseHr`, `stageRatingFromScore`, `pendingWith`, `completionStatus`, `eligibilityLabel` helpers and their outputs untouched — the RCA payload does not change, only its presentation.
5. No changes to the Executive Summary, breakdowns, Employees table or export workbook.

## Verification steps

- Search `101125` → see all four sections populated; "Management" section shows a name/score/rating/comment or a clear "Pending" row; no horizontal scroll.
- Search `101784` (existing default) → HOD / BU / HR sections still render as before for a non-terminal-Management case.
- Search a `pending_self` case → outcome section shows `Pending With: <employee name>`, stage scores show "—" for later stages, diagnosis still renders.
- Run `bunx vitest run src/components/reports/annual-review` if tests exist for this file; otherwise no test change.

## Out of scope

- No database migration, RPC change, RLS change, or edits to `comprehensiveReport.ts` service (I'll only *read* it to confirm the Management field name; if that field isn't yet exposed I will surface it as a small typed passthrough in the same service file — flagged before doing so).
- No changes to POLICY.md / DOCUMENTATION.md unless the Management passthrough is needed, in which case a one-line ADR-151 addendum is added.

Confirm and I'll switch to build mode.