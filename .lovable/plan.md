## Goal
Remove the standalone "HR Finalization" tab. The HR Head is now simply the head of the Business Unit named **HR** — managed inline on the Business Units tab like every other BU head. Annual Review reads the HR head from that BU's `head_user_id`.

## Risk & Impact
- **Data**: No schema changes. `org_head_config` is left in place (read-only, deprecated) to avoid destructive migration; it's no longer written or read by app code. Rollback = revert code only.
- **Workflow**: Annual Review HR Finalization stage now resolves `hr_id` from the BU named `HR` (case-insensitive, scoped to the cycle's company). Fallback chain (override → existing args.hrUserId) preserved.
- **UI**: One tab disappears from Admin → Organization. BU Head column already handles the "HR" BU row — nothing new to learn.
- **Regression**: Low. Single resolver path; all callers go through one helper.
- **Scalability**: Same single-row lookup as today.

## Plan

1. **Resolver helper** (new, `src/services/orgHeads/hrHeadResolver.ts`)
   - `getHrHeadUserId(companyId: string | null): Promise<string | null>` — SELECT `head_user_id` FROM `business_units` WHERE `lower(name) = 'hr'` AND `company_id = $1` (or NULL company) LIMIT 1.

2. **Annual Review service** (`src/services/annualReview/annualReviewService.ts`)
   - Replace the two `org_head_config` reads (≈ lines 805–811 and 955–958) with `getHrHeadUserId(companyId)`. Keep existing fallback to `args.hrUserId`.

3. **Admin Organization page** (`src/pages/admin/Organization.tsx`)
   - Remove the `org-heads` tab entry (line 34) and its render block (line 582).
   - Remove the `HrFinalizationCard` import.

4. **Delete dead component**
   - `src/components/admin/HrFinalizationCard.tsx` — remove.
   - Keep `src/components/annual-review/HrFinalizationSheet.tsx` (different concern: per-cycle stage UI). Verify it doesn't import the deleted card.

5. **Docs / memory sync**
   - `mem/features/admin/org-heads.md`: rewrite Storage + UI sections — HR head = `business_units.head_user_id` of the BU named "HR". Drop `org_head_config` references from the active SSOT (note as deprecated).
   - `src/modules/annual-review/POLICY.md` + `DOCUMENTATION.md`: update the "HR Head" definition to point at the BU-named-HR rule.

6. **Tests**
   - Add unit test for `getHrHeadUserId`: returns head_user_id for matching BU; null when no BU named HR exists; case-insensitive match.
   - Update any annual-review service tests that mock `org_head_config` to mock the BU lookup instead.

## What changes visually
- Admin → Organization: the **HR Finalization** tab is gone. The BU named "HR" on the **Business Units** tab now serves as the single place to view/change the HR head (Auto/Manual badge, recalculate, change-head picker — same controls as every other BU).

## Out of scope
- Dropping `org_head_config` table/RPCs (left for a later cleanup migration once we've confirmed no external readers).
- Any change to `BuHeadColumn`, the searchable picker, or `resolve_bu_head` logic.
