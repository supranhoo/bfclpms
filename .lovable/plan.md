
Revised Plan: Fix “Open in App” for observation notifications so admins/reviewers open the target employee KPI, not their own dashboard

What I found:
- The earlier database fix added `metadata.employee_id` to new observation-reply notifications, but the frontend routing is still too broad.
- In `src/lib/inboxUtils.ts`, these 4 notification types are grouped together:
  - `observation_raised`
  - `observation_reply`
  - `observation_resolved`
  - `observation_mention`
- For any non-self case, they currently route to `mentioned_kpi`, which is the read-only mention flow.
- That flow is correct for `observation_mention`, but not for admin/manager/auditor/management observation notifications. Those users should open the employee scorecard context, not the self dashboard shell.

Implementation plan:

1. Split observation routing in `src/lib/inboxUtils.ts`
- Keep `observation_mention` on:
  - `/dashboard?mentioned_kpi=...&mentioned_employee=...`
- Change `observation_raised`, `observation_reply`, and `observation_resolved` to:
  - self target → `/dashboard?kpi=...`
  - other employee target → reviewer/admin deep-link with employee context

2. Make routing role-aware
- Extend `getNotificationNavigationPath(...)` to accept current viewer role/effective role
- Use role-based view mapping for other-employee observation links:
  - admin / manager → `view=team`
  - auditor → `view=audit`
  - management → `view=management`
  - hr_pms → `view=hr_pms`
  - safe fallback → `view=team`
- Update callers:
  - `src/pages/QueryInbox.tsx`
  - `src/components/inbox/InboxDetailSheet.tsx`
  - `src/components/inbox/InboxRowItem.tsx`
  - `src/components/inbox/MobileInboxList.tsx`

3. Backfill existing observation notifications
- Add a migration to patch old `notifications` rows for:
  - `observation_raised`
  - `observation_reply`
  - `observation_resolved`
- Fill `metadata.employee_id` from `kpi_id -> kpis.employee_id`
- Re-audit observation notification triggers so all future rows consistently include KPI-owner context

4. Regression protection
- Expand `src/lib/inboxUtils.test.ts` with explicit cases for:
  - employee opens own observation reply
  - admin opens another employee’s observation reply
  - auditor/management role mapping
  - `observation_mention` still using mention sheet
  - fallback behavior when metadata is incomplete
- Add/update inline mock notification fixtures used by those tests

5. SSOT / policy sync
- Update `DOCUMENTATION.md`
- Update `POLICY.md`
- Record the rule:
  - mentions use read-only mention routing
  - observation workflow notifications for reviewers/admins must open the target employee scorecard

Risk & Impact Report:
- Data impact: low; only notification metadata backfill, no schema shape change
- Workflow impact: navigation only, no scoring/review logic changes
- UI/UX impact: improves consistency; “Open in App” will open the correct employee context
- Regression risk: medium-low because inbox routing is shared; tests will contain it
- Mitigation: isolate logic to the routing helper, preserve non-observation routes, add route tests before/with change

Expected result:
- If Jaspal (100125) opens an observation-reply notification for another employee, it opens that employee’s KPI in admin/reviewer context
- If the employee opens their own notification, it still opens their own KPI
- @mentions continue to open the read-only mention sheet
- Older observation notifications also start working after metadata backfill
