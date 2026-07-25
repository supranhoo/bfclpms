## Error
Toast: `invalid input value for enum annual_review_status: "pending_bu_head"` when saving the Edit workflow & reviewers dialog in supersede mode for Balram Mahto (bu_head reviewer replaced).

## 5-Why RCA
1. **Why did save fail?** DB rejected `pending_bu_head`.
2. **Why was that string used?** `reassign_annual_review_reviewer` builds the rewind status as `'pending_' || p_role` (ADR-160/160b, migration `20260725083353` line 224).
3. **Why is that wrong?** Enum values are canonical short forms: `pending_bu`, `pending_dept`, `pending_skip` — not `pending_bu_head`/`pending_dept_head`/`pending_skip_manager`.
4. **Why didn't the CASE cover it?** Only `skip_manager → skip` was patched; `bu_head → bu` and `dept_head → dept` were missed.
5. **Why not caught earlier?** Prior supersede tests exercised `manager`/`hr`/`management` (identity mapping works); `bu_head`/`dept_head` reassignment in supersede was never triggered until this admin action.

## Impact
- Any supersede reassignment of `bu_head` or `dept_head` currently 500s.
- `set_annual_review_enabled_stages` in same file uses a proper `_pending_status_for_role()` mapping already, so it's fine — only `reassign_annual_review_reviewer` is affected.

## Fix (single migration)
Redefine `public.reassign_annual_review_reviewer` with a correct role→status mapping:

```sql
v_target_status := (CASE p_role
    WHEN 'manager'      THEN 'pending_manager'
    WHEN 'skip_manager' THEN 'pending_skip'
    WHEN 'dept_head'    THEN 'pending_dept'
    WHEN 'bu_head'      THEN 'pending_bu'
    WHEN 'hr'           THEN 'pending_hr'
    WHEN 'management'   THEN 'pending_management'
END)::public.annual_review_status;
```

All other logic (locked-response archiving, override upsert, instance update, audit rows, notifications) stays identical — surgical change.

## Verification
- Retry the failing Balram Mahto save: bu_head replaced, expect status rewind to `pending_bu`.
- Confirm dept_head supersede also lands on `pending_dept` (spot query).
- Grep for other `'pending_' || p_role` concatenations in `supabase/migrations` — the two older migrations (`20260724122536`, `20260724123142`) are superseded by `20260725083353`; only this file's function is live. New migration replaces it in place.

## CAPA
- **Corrective:** Migration replaces the function with the explicit mapping.
- **Preventive:** Add a POLICY note (§AR-STATUS-ROLE-MAP) that any `role → pending_*` mapping must use the canonical short form, and audit any future dynamic `'pending_' || role` construction as forbidden.
- Update ADR-160c doc line noting the enum-mapping fix.

## Not applicable
UI changes, tests (SQL-only RPC fix; existing unit test `workflowEditImpact` already asserts `pending_bu`).
