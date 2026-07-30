
# Employee Import — 3 rows failed with "Edge Function returned a non-2xx status code"

## 1. Assumptions

- The screenshot is the **Import Data → Employees** result panel (4 total, 1 success, 3 failed).
- Rows 2/4/5 are employee codes `101393`, `101395`, `101818`; row 3 (`101394`, Nitin Agarwal) succeeded.
- The same spreadsheet is still available for a re-run.

## 2. What I verified (read-only)

| Check | Result |
|---|---|
| `profiles` for 101393 / 101395 / 101818 | **No rows** — nothing was created or partially written |
| `profiles` for 101394 | Exists, `updated_at = 2026-07-30 05:54:05` (the 1 success) |
| `create-employee` logs at 05:54 | 3 invocations, each logged `Auth header present` → `User validated: 535d9a14…` (admin) and then **nothing** |

So the caller was authenticated and authorised, and the function returned a non-2xx **without logging anything**.

## 3. Root cause analysis

### The error message you see is not the real error

`ImportData.tsx` calls `supabase.functions.invoke('create-employee', …)`. On a non-2xx response supabase-js returns `data = null` and a generic `FunctionsHttpError` whose `.message` is literally *"Edge Function returned a non-2xx status code"*; the JSON body sits unread on `fnError.context`. The code does `fnData?.error || fnError.message` — but `fnData` is always `null` in that branch, so the server's real message is discarded on every failure.

### The server didn't log it either

In `supabase/functions/create-employee/index.ts` there are exactly three early-return paths that produce a non-2xx **with no `console.*` call**:

1. `400 Unknown employee category: '…'`
2. `400 Unknown employment status: '…'`
3. `403 Unauthorized` (ruled out — caller is the admin id)

Given the logs, the 3 failures are one of the two 400 master-data rejections.

### Most likely trigger: company-scoped category matching

`employee_categories` currently holds 7 rows (`AGM and above`, `Casual`, `Consultant`, `ESI`, `Non ESI`, `Retainership`, `Trainee`) and **every one is bound to company `BFCL`**. There are 3 companies (`BFCL`, `Saibal`, `Aruna Industries`). The function accepts a category only when
`!body.company_id || !row.company_id || row.company_id === body.company_id`.

So any import row whose **Company column resolves to Saibal or Aruna** is rejected for *every* category value, even a perfectly valid one. A spelling variant (`Non-ESI`, `NON ESI  `) or an employment status outside `Confirmed / Probation / Retainer / Superannuated / Trainee` would produce the same silent 400.

**Honest limit:** the exact per-row string cannot be recovered — it was never logged and never returned to the UI. Step 1 below is what makes it knowable.

### 5 Whys

1. Import showed a generic error → the UI printed the SDK's placeholder message.
2. It printed the placeholder → `fnData` is `null` on non-2xx, so the server's `error` field was unreachable.
3. Nobody caught it earlier → the server also returned those 400s without logging.
4. The 400 fired at all → a master-data value failed strict validation, plausibly because categories are company-scoped to BFCL only.
5. Company scoping bites silently → no ADR/policy required validation rejections to be observable.

## 4. Risk & impact

- **Data:** none. No partial writes; the 3 employees simply don't exist. No schema change proposed except optional seeding of master data (additive).
- **Workflow:** unchanged; only error reporting improves.
- **UI/UX:** the Issues table shows a real reason instead of a placeholder. No layout change.
- **Regression risk:** low. Error-path-only edits in one client file and one edge function.
- **Scalability:** unchanged (per-row calls, existing batching).
- **Rollback:** revert the two files and redeploy; no data migration to undo.

## 5. Plan

**Step 1 — Surface the real error in the client (the actual fix for "why did it fail?")**
In `src/pages/admin/ImportData.tsx`, add a shared helper that reads `fnError.context.json()` / `.text()` and extracts `error`/`message`, falling back to the SDK message. Use it in both `create-employee` call sites (the auto-create path at ~line 1050 already reads the body correctly via raw `fetch`; the `invoke` path at ~line 1497 does not).
*Verification:* a deliberately bad category in a 1-row test file shows `Unknown employee category: 'X'` in the Issues table.

**Step 2 — Make server rejections observable**
Add `console.warn` with employee code + offending value before each of the two 400 returns, and before the 403. Include the resolved `company_id` in the category rejection log.
*Verification:* edge logs show one line per rejected row.

**Step 3 — Re-run the same 4-row file and read the real reason**
With Steps 1–2 live, re-import. The Issues table plus edge logs will name the exact failing field and value for 101393 / 101395 / 101818.

**Step 4 — Correct the underlying data (decided after Step 3)**
Two likely outcomes:
- *Spelling/whitespace variant* → fix the spreadsheet cells, re-import. No code change.
- *Company-scoping mismatch* → either add the missing categories for `Saibal` / `Aruna Industries` in **Admin → Master Data → Employee Categories**, or relax the scope check to fall back to a global match when the company has no categories of its own. I will bring this back as an explicit decision rather than silently loosening validation.

**Step 5 — Pre-flight validation in the importer (prevents recurrence)**
The importer already validates departments and managers before dispatch. Extend the same pre-flight to `employeeCategory` and `employmentStatus` against the loaded master lists, so bad values are flagged as row errors in the preview step instead of costing a round-trip and a mystery 500.

**Step 6 — Tests & docs**
- Unit test: `invoke` error with a JSON body on `context` → helper returns the server's message, not the placeholder.
- Unit test: pre-flight flags an unknown category/status before any network call.
- Mock data covering valid, misspelled, and cross-company category rows.
- `docs/adr/ADR-202.md` (edge-function error bodies must reach the import Issues table; validation rejections must be logged), plus `POLICY.md` §IMPORT-ERROR-TRANSPARENCY and a `DOCUMENTATION.md` version bump.

## 6. UI changes

Only inside the existing **Import Results → Issues** table: the `ERROR` cell shows the server's message (e.g. `Unknown employee category: 'Non-ESI'`) instead of `Edge Function returned a non-2xx status code`. Long messages wrap; the Download Error Report CSV carries the same text. No new components, no layout or responsiveness change.

## 7. Technical detail

- `src/pages/admin/ImportData.tsx` — new `extractFunctionError(fnError, fnData)` helper; used at the `invoke` call site; pre-flight master-data checks added to the employee row validator.
- `supabase/functions/create-employee/index.ts` — `console.warn` before the two 400 returns and the 403; no behavioural change to the happy path.
- No RLS, no schema, no trigger changes. Master-data rows (if Step 4 requires them) are additive inserts via the existing admin UI.
