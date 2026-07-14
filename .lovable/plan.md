## No build required — feature already exists

The Department Head re-sync you're looking for is already built and live.

### Where to find it
1. Go to **Admin → Organization Setup → Departments** tab.
2. In the **Head** column for the department you updated, look at the small icon row on the right (next to the Auto/Manual badge).
3. Click the **people icon** (👥, tooltip: *"Re-sync open Annual Reviews with this head"*).
   - It's only visible when a Dept Head is set AND an Annual Review cycle is active.
4. Confirm in the dialog "Re-sync Annual Reviews for &lt;dept&gt;" → **Re-sync now**.

### What it does
- Calls RPC `resync_annual_review_dept_head(cycle, dept)`.
- Pushes the current Dept Head onto every open Annual Review instance in the department for the active cycle.
- **Skips** instances that already moved past the Dept Head stage or are finalized (reported back as "skipped" in the toast).
- Writes an audit-log row per invocation.

### If it still doesn't sync after clicking
Likely one of:
- The instance has already advanced past the Dept Head stage → intentionally skipped (immutable-history rule).
- The employee's `department_id` on their profile doesn't match the department whose head you changed.
- No active Annual Review cycle.

Tell me the employee code + department and I'll trace the RPC's audit log and confirm which branch fired.

### Not building anything now
Per your answer ("Feature exists but I didn't see it"), no code changes. Approve this plan to close the loop; ping me if the re-sync click doesn't take effect on a specific employee.