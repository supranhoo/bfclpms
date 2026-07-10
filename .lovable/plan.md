## Add "Dept head" to Reassign reviewer dialog

### Why
The dialog role picker exposes Manager / Skip manager / BU head / HR, but the annual-review instance already has a `dept_head_id` slot and workflows use the `dept_head` stage. Reassignment for that stage is impossible today.

### Changes

**1. UI — `src/components/annual-review/ReassignReviewerDialog.tsx`**
- Extend `Role` union to include `'dept_head'`.
- Add `<SelectItem value="dept_head">Dept head</SelectItem>` between *Skip manager* and *BU head* (matches the stage order used elsewhere in the app).
- Extend `currentReviewerId` map: `dept_head: instance.dept_head_id`.
- No other UI logic changes (search, reason, submit flow untouched).

**2. RPC — new migration**
- Update `public.reassign_annual_review_reviewer`:
  - Allow `p_role IN ('manager','skip_manager','dept_head','bu_head','hr')`.
  - Add branch: `ELSIF p_role = 'dept_head' THEN UPDATE annual_review_instances SET dept_head_id = p_new_reviewer_id, updated_at = now() WHERE id = p_instance_id;`
- Keep `SECURITY DEFINER`, admin/hr_pms gate, min-3-char reason, audit-log insert, and the `annual_review_assignment_overrides` upsert unchanged.

**3. Overrides table**
- `annual_review_assignment_overrides.role` currently accepts free text (existing values include the four current roles). If a CHECK constraint restricts it, the migration widens it to include `dept_head`. Verified at migration time.

**4. Tests**
- No new unit test file — behaviour is a straight extension of an existing enum. A follow-up smoke test can be added if requested.

### Out of scope
- No changes to the resolver, rule engine, or stage visibility logic — `dept_head` is already a first-class stage. This only unlocks manual reassignment for it.

### Risk
Low. Additive enum entry + one new UPDATE branch. Existing reassignments continue to work.
