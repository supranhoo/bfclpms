
# Assisted (Proxy) Submission Tracking for Admins

## Current state (verified)

- Every assisted submission already writes an immutable audit row to `annual_review_proxy_submissions` — **2,037 rows exist today** (1,061 with a selfie, 992 with an uploaded photograph).
- Columns captured: `instance_id`, `employee_user_id`, `proxy_user_id`, `proxy_role`, `selfie_path`, `photo_upload_path`, `declaration_text`, `user_agent`, `ip`, `captured_at`.
- Read access is already correct: the `arps_select_visible` policy allows the employee, the assisting user, the employee's manager/skip manager, **admin**, and **hr_pms**. Storage has a matching `proxy_selfies_select` policy.
- **Gap:** nothing in the app reads this table. `getProxyAuditForInstance()` and `createSignedSelfieUrl()` exist in `src/services/annualReview/proxySubmission.ts` but are called by no component. So the evidence is being collected and is invisible.

No database or security change is needed — this is a read-only surfacing job.

## Where it goes

Two entry points, both admin-facing:

**1. Primary — a new "Assisted Submissions" tab** in Annual Review → Admin (`src/pages/annual-review/AnnualReviewAdmin.tsx`), sitting alongside Orphaned Reviews and Unscored Stages. Same place admins already go for review governance.

**2. Secondary — an inline badge** on any review that was submitted with assistance, shown in the admin Progress grid row and on the review detail page. Clicking it opens the same evidence drawer. This answers "was *this* review self-submitted?" without leaving the record.

## How it works

### The tab

A filter bar + server-paginated table (25/page, `.range()`, `count: 'exact'` — no unbounded load):

- **Filters:** cycle (defaults to active), date range on `captured_at`, assisting person, department / business unit, evidence completeness (has selfie / has photo / neither), free-text search on employee name or code.
- **Columns:** Employee (name + code), Department/BU, Assisted by (name + code), Role at time of assistance (`proxy_role`), Captured at, Evidence (selfie / photo chips), Review status now, Actions.
- **Row action → Evidence drawer:** selfie and uploaded photograph rendered from short-lived signed URLs (5 min), the exact `declaration_text` the assistant accepted, `captured_at`, `user_agent`, `ip`, and a deep link to the full review.
- **Header summary:** total assisted this cycle, % of all submissions assisted, count missing selfie, count missing photo, top 5 assisting users by volume — so an admin can spot one person submitting for dozens of employees.
- **Export CSV** of the filtered set (evidence paths are exported as presence flags, never as raw storage URLs).

### Verification angle

"Verify the assisted self-service records" is served by the completeness filter plus the top-assistor summary: an admin can pull every assisted submission with no selfie, or every submission made by one person, and open the evidence to confirm the employee was actually present.

## Technical details

- New RPC `get_annual_review_assisted_submissions(p_cycle_id, p_from, p_to, p_proxy_user_id, p_dept_id, p_bu_id, p_evidence, p_search, p_limit, p_offset)` — `SECURITY INVOKER` so the existing RLS policy stays the sole authority; returns rows plus `total_count`. Joins `profiles` for employee/assistant names and `annual_review_instances` for current status. A second RPC `get_annual_review_assisted_summary(p_cycle_id)` returns the header aggregates.
- New files: `src/services/annualReview/assistedSubmissions.ts` (data layer), `src/hooks/annualReview/useAssistedSubmissions.ts` (React Query, keyed on all filters), `src/components/annual-review/admin/AssistedSubmissionsTab.tsx`, `src/components/annual-review/admin/AssistedEvidenceDrawer.tsx`.
- Signed URLs are minted on drawer open only, never in the list — avoids 25 signing round-trips per page and limits URL exposure.
- Tab is gated on `admin` / `hr_pms` exactly as the sibling governance tabs are; the menu entry is registered in `menu_access_config` so it can be mapped to other roles later without a code change (zero-hardcoding rule).
- Tests: `assistedSubmissions.test.ts` (pagination range math, filter → RPC arg mapping, evidence-completeness classification, CSV shape with no raw paths) and a hook test asserting the query key changes with every filter.
- Docs: ADR-203 + `POLICY.md §AR-ASSISTED-SUBMISSION-VISIBILITY` (assisted submissions must be auditable by admin/HR; evidence served only via short-lived signed URLs) + `DOCUMENTATION.md` version entry.

## Risk & impact

- **Data:** none — read-only. No schema, RLS, or trigger change.
- **Workflow:** none. Submission behaviour is untouched.
- **UI/UX:** one new tab in an existing tab strip; the strip already scrolls horizontally on mobile.
- **Regression risk:** low, isolated new components. Only shared touch is adding one `<TabsTrigger>` / `<TabsContent>` pair.
- **Scalability:** 2,037 rows today and growing one row per assisted submission; server-side pagination and indexed filters keep it flat. Add an index on `(instance_id)` and `(captured_at DESC)` if the query plan warrants it.
- **Rollback:** delete the new files, remove the tab pair, drop the two RPCs. No data migration to undo.
