# BU Console — remove every silent-truncation ceiling

Goal: guarantee that nothing in the console ever shows or acts on a partial set without saying so. Verified the current state before writing this; findings below are from the live code and database, not assumptions.

## What is already safe (verified)

- All heavy reads and every write go through `bu_console_*` / `bu_goal_*` database functions that return a single JSON document. The 1,000-row transport cap does not apply to them.
- The KPI detail employee table and the Goals table are both server-paged at 200/page with a real total and Previous/Next controls.
- Group value entry and group approval act on the **whole** matching set on the server — no page limit sneaks into the write. The write set is bounded only by the scope the admin chose.
- The category/KRA/KPI tree is a grouped aggregate: 1,309 distinct KPI nodes across the whole of 2026, not 20,698 rows.

## The real ceilings that remain

1. **Merge proposals list** reads the table directly with a hard cap of 500 rows, no total and no paging. Past 500 proposals the tab silently hides the rest.
2. **Goal form KPI picker** returns at most 100 definitions and never tells the user the list was cut, so a definition can look "missing".
3. **Group preview payloads are unbounded.** Preview and commit return one entry per affected employee and the dialog renders all of them at once. Largest KPI group today is 136 employees, so nothing is broken now — but there is no cap, no summary-first view, and no warning, so a company-wide scope would produce a very large payload and a sluggish dialog.
4. **The tree renders every node at once.** Fine at ~1,300 nodes for a single period; no guard if a future scope is broader.

## Plan

**1. Page the merge proposals tab.** Add a `bu_console_merge_proposal_list(status, page, page_size)` function returning rows plus a true total, and give the tab the same 200/page Previous/Next footer the Goals tab uses. Removes the 500 cap entirely.

**2. Make the definition picker honest.** Raise the picker to a server-side search that returns the match count, and when results are capped show "Showing first 100 of N — keep typing to narrow". No silent cut.

**3. Summary-first group previews.** Change both group functions so a preview always returns full counts (write/skip totals and skip reasons grouped by reason) but caps the per-employee detail list at 500 entries, flagged with `detail_truncated` and the true total. The dialogs lead with the counts and reason breakdown, and show the detail list under a "showing first 500 of N" note. The commit path stays uncapped — every eligible employee is still written.

**4. Scope guard on very large group actions.** When a preview reports more than 2,000 affected employees, require an explicit typed confirmation before commit, and surface the count in the confirm button. Protects against an accidental whole-company write.

**5. Virtualise the two long lists.** Apply `@tanstack/react-virtual` to the KPI tree body and the preview detail table so render cost stays flat regardless of size.

**6. Regression cover.** Extend the existing console test files with cases that assert: paged results report a total larger than the page, a truncated preview still reconciles counts against the true totals, and truncation never removes a row from the commit set.

## Technical notes

- New/changed functions: `bu_console_merge_proposal_list` (new, SECURITY DEFINER, `bu_console_can_read` gated), `bu_console_group_write` and `bu_console_group_advance` (add `detail_truncated`, `detail_limit`, `skip_summary` to the returned document; behaviour of the commit path unchanged).
- No schema change, no data migration, no change to who can see or write what. Rollback is re-deploying the previous function bodies.
- `POLICY.md` gains a rule under the BU Console beta section: any console surface that can exceed its display cap must expose the true total and label the cut. `DOCUMENTATION.md` gets an ADR-264 entry.
