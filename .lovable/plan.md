# Evidence preview still times out for Satyam — RCA, 5 Why, CAPA and fix plan

## Assumptions

- The screenshot is Satyam Agarwal opening Kanha Modi’s July 2026 KPI evidence: `101762_Documents_sharing_with_client_within_5_w_Self_Evidence.xlsx`.
- The objective is to make the attachment open reliably, not merely improve the error message.
- Evidence visibility must remain private and must continue to follow the same KPI-participant authorization rules.

## Verified incident facts

- The object exists in `review-evidence`, is an XLSX, and is only **1,063,787 bytes**; file absence and file size are not the cause.
- The object path identifies KPI `34048bf8-6cb8-421b-8882-dee6d9d53c8e`, owned by Kanha Modi (101762).
- Satyam is Kanha’s manager-of-manager: Kanha → Rebecca Roy → Satyam. The canonical `can_read_kpi_evidence()` rule therefore authorizes him.
- The browser diagnostics show `elapsed=19650ms attempts=3 transport=signed fallback=not-tried class=hang`. ADR-300 retried, but consumed nearly the entire 20-second budget before the fallback eligibility check.
- The live database log contains this exact object lookup. It took **12,177 ms** while the authenticated database role has an **8-second statement timeout**.
- Its query plan shows that all `storage.objects` read policies are OR-combined. Four policies currently match `review-evidence`, including the obsolete broad `Users can view authorized evidence` policy and a redundant observation policy. The obsolete policy expands into expensive profile and annual-review RLS subplans; PostgreSQL does not guarantee short-circuiting merely because the canonical participant policy has a cheap manager branch.
- `createSignedUrl()` and `storage.download()` use different HTTP routes but both perform the same `storage.objects` authorization. The current “alternative route” therefore repeats the same slow database predicate; it is not an independent backend path.
- For Office files, a successful download fallback returns a local `blob:` URL, but the UI sends that URL to Microsoft Office Online. Microsoft’s server cannot fetch a browser-local `blob:` URL, so a small XLSX can also enter a silent iframe hang after the loader reports success.
- The timeout helper abandons timed-out promises without cancelling the underlying request. Up to three stale sign requests can remain active while the fallback starts.

## Root cause analysis

### Primary root cause — backend authorization plan regression

The evidence object lookup is not slow because Satyam lacks access. It is slow because superseded and overlapping storage read policies are combined into one large authorization expression. The old folder-owner policy reads `profiles` under that table’s now-complex RLS rules, pulling annual-review and organization subplans into a single-object storage lookup. The observed lookup took 12.18 seconds and crossed the 8-second authenticated limit.

### Secondary root cause — fallback budget starvation

ADR-300 allocates three signing attempts of up to six seconds plus 400/1,200 ms backoff inside a 20-second budget. That schedule can consume about 19.6 seconds by design. The fallback requires more than one second remaining, so the screenshot’s `fallback=not-tried` is the expected result of the current arithmetic. The policy promises that fallback “always gets a chance”; the implementation does not guarantee that.

### Tertiary root cause — fallback is not valid for Office preview

When authenticated download succeeds, the fallback creates a local object URL. That works for images, PDF, Download, and Open in new tab. It cannot be used as the source that Microsoft Office Online fetches remotely. The Office iframe has no load/error watchdog, so this failure becomes another endless preview.

### Contributing systemic cause — database load

The current slow-query snapshot still ranks broad KPI and profile reads at the top, with executions approaching the 8-second ceiling. This does not replace the exact policy-plan diagnosis above, but it increases the frequency with which an already-expensive storage authorization crosses its timeout.

## 5 Why analysis

1. **Why did Satyam still see a timeout after the Ashish fix?**  
   Because none of the three signing attempts completed and no usable preview transport returned.
2. **Why did a single-object sign request not complete?**  
   Because the exact `storage.objects` lookup spent 12.18 seconds evaluating the combined read-policy plan, beyond the authenticated timeout.
3. **Why was the object lookup evaluating a large plan?**  
   Because the canonical KPI-participant policy coexists with superseded broad and redundant `review-evidence` read policies; PostgreSQL OR-combines them and pulls profile/annual-review RLS into the lookup.
4. **Why did the frontend fallback not rescue the request?**  
   Because retries consumed 19.65 of the 20 seconds, leaving less than the fallback’s minimum budget, and download would still repeat the same database authorization path.
5. **Why did the earlier CAPA appear complete when it was not?**  
   It treated the Ashish incident as a transport-only hang, tested the loader with mocked JPG requests, and did not execute an authenticated XLSX preview against the real storage policy plan. It verified notification, retry, and a mocked blob result—not end-to-end file rendering.

## CAPA

### Corrective actions

1. **Consolidate storage read authorization to one canonical policy.**
   - Remove the superseded `Users can view authorized evidence` read policy and redundant observation-only policy after capturing their definitions for rollback.
   - Retain one `Review evidence readable by KPI participants` policy for normal/observation evidence and the separate Org KPI policy for its distinct path convention.
   - Preserve the private bucket and existing authorization set; this is a query-plan correction, not a permission widening.

2. **Optimize the canonical evidence authorization function.**
   - Keep cheap allow branches first: owner, global roles, direct/functional/manager-of-manager.
   - Move indexed mention/auditor checks before expensive workflow/org-owner resolution.
   - Add an additive index beginning with `org_kpi_data_owners.owner_id` for the late owner branch.
   - Restore least-privilege grants: revoke PUBLIC/anonymous execution and grant only authenticated/backend execution.

3. **Guarantee fallback time instead of hoping time remains.**
   - Reserve a fixed fallback budget from the start; signing cannot consume it.
   - Reduce sign attempts/budgets to fit the measured 8-second backend ceiling and record per-attempt durations.
   - Classify `fallback=skipped-budget` separately; `not-tried` must never result from a retry schedule that exhausted its own budget.
   - Replace uncancelled SDK sign attempts with an abortable storage request adapter where supported, so a timed-out attempt terminates before retry/fallback.

4. **Make XLSX fallback render locally.**
   - Preserve signed HTTPS + Office Online as the streaming fast path.
   - When fallback returns an XLSX/XLS/CSV blob, parse it with the installed `xlsx` package and render a bounded, read-only workbook preview locally; never send a `blob:` URL to Office Online.
   - Cap rendered rows/columns and provide sheet tabs plus Download for larger workbooks.
   - For DOC/DOCX/PPT/PPTX fallback, show a clear “Preview unavailable; download to open” state rather than an infinite iframe.
   - Add an iframe watchdog to the remote Office fast path so third-party viewer failure cannot spin forever.

5. **Reduce the load that amplifies storage latency.**
   - Re-audit current callers of broad KPI/profile reads and confirm they use slim, paginated backend paths already required by policy.
   - Use before/after timing over a fresh window; do not rely only on cumulative slow-query totals.

### Preventive actions

- Add a database regression guard asserting only the intended `review-evidence` read policies exist.
- Add a query-plan/performance guard for an authorized owner, direct manager, manager-of-manager (Satyam case), auditor, HR/management, mention, org-data-owner, and denied user.
- Add component tests proving an Office fallback blob is rendered locally or converted to an explicit download state—never passed to Office Online.
- Add timeout-budget tests proving fallback always starts with its reserved budget and timed-out requests are cancelled.
- Add authenticated end-to-end checks for both signed URL and download against the exact Satyam/Kanha object, followed by visible XLSX rendering verification.
- Record the correction in a new ADR, update POLICY’s fallback guarantee, update DOCUMENTATION.md/version history, and update realistic mock evidence to include XLSX and every failure branch.

## Risk & Impact Report

- **Data impact:** No business row or evidence object changes. Additive index plus storage-policy/function changes only. Historical evidence remains untouched.
- **RLS/security impact:** Permission semantics must remain unchanged. Consolidation reduces duplicate evaluation; prove it with an allow/deny access matrix before and after. The bucket remains private.
- **Workflow impact:** None outside opening evidence. Upload, scoring, submission, and approval flows are unchanged.
- **UI/UX impact:** Same preview dialog. XLSX fallback becomes a real local workbook preview; unsupported Office fallback becomes an honest download state instead of a spinner.
- **Scalability impact:** Fewer policy subplans per object lookup; indexed late branch; bounded workbook rendering; no unbounded row rendering or full evidence listing.
- **Regression risk:** Medium because storage RLS protects sensitive files. Mitigation is policy-definition snapshot, parity tests for every role/path, exact-object verification, and denied-user boundary testing.
- **Backup impact:** No new table and no excluded data. Existing automatic table backup coverage is unchanged.
- **Rollback:** Restore the captured policies/function/grants, remove the additive index, and revert the frontend loader/renderer. No evidence or KPI data rollback is required.

## Step-by-step implementation and verification

1. **Baseline the exact incident**
   - Capture current policy/function/grant definitions and exact object lookup plan.
   - Execute signed-URL and download requests as Satyam for the Kanha object and record status/latency.
   - Execute the same calls as a denied authenticated user and confirm denial.

2. **Apply the backend migration**
   - Consolidate policies, reorder the function, add the owner-first index, and tighten function grants in one reviewed migration.
   - Run the security linter and policy inventory guard.
   - Re-run Satyam and denied-user calls; target authorization well below 8 seconds with identical allow/deny outcomes.

3. **Repair transport budgeting and cancellation**
   - Introduce a transport service with an explicit overall deadline split between sign and fallback.
   - Ensure timed-out requests are aborted and fallback receives a guaranteed budget.
   - Verify retries, aborts, fallback timing, and diagnostics in unit tests.

4. **Repair Office fallback rendering**
   - Add the bounded local spreadsheet renderer and guard all Office blob outcomes.
   - Add remote-viewer timeout/error handling.
   - Verify XLSX fast path, XLSX local fallback, oversized workbook behavior, and DOC/PPT download-only fallback.

5. **Authenticated end-to-end verification**
   - Open Satyam’s exact attachment in the running app and confirm workbook content appears, not just that a loader promise resolves.
   - Verify Download and Open in new tab.
   - Verify owner, direct manager, Satyam manager-of-manager, auditor/HR, and denied-user boundaries separately.
   - Inspect fresh database logs to confirm the exact storage lookup no longer times out.

6. **Governance and release evidence**
   - Add ADR, POLICY.md, DOCUMENTATION.md/version-history, tests, and mock-data updates in the same change.
   - Record before/after latency and rollback SQL in the ADR.

## UI changes

- **Location:** Existing evidence preview dialog only.
- **Visual change:** XLSX fallback displays a read-only worksheet with sheet tabs and bounded rows/columns. Unsupported Office fallback displays a concise download action.
- **Interaction:** Retry remains; Download/Open remain; no local `blob:` URL is sent to a remote Office viewer.
- **Responsiveness:** Spreadsheet region scrolls inside the existing desktop dialog and mobile drawer; toolbar remains fixed and touch targets unchanged.

## Tests

- Unit: timeout partitioning, abort behavior, guaranteed fallback, diagnostics classes.
- Component: signed XLSX iframe, downloaded XLSX local render, remote viewer timeout, unsupported Office fallback, Download/Open.
- Database: policy inventory, role/path parity matrix, owner-index plan, Satyam manager-of-manager path, denied boundary.
- End-to-end: exact authenticated Satyam/Kanha XLSX opens visibly; download works; denied user cannot sign or download.

## DOCUMENTATION.md updates

- Add a version-history entry with the verified 12.18-second object lookup, overlapping-policy cause, backend correction, local XLSX fallback, before/after timings, and rollback.

## POLICY.md updates

- Amend §EVIDENCE-PREVIEW-TRANSPORT-FALLBACK: fallback must have reserved time, must not repeat an unbounded authorization plan, and an Office `blob:` URL must never be sent to a remote viewer.
- Amend evidence RLS policy: one canonical participant policy per path family; superseded overlapping policies are forbidden.

## Post-implementation notes

- This plan intentionally fixes the backend query and XLSX rendering path together. Shipping only another frontend message, or only increasing timeouts, would preserve the underlying failure.