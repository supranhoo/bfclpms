## Goal
Reframe the "Pilot Access — Annual Review" card as a **Phased Rollout** control (pilot is just phase 1) and surface **which form (template) each user will see** so admins can verify audience + form together before enabling.

## Answer to the question
Yes — `admin_feature_flags.annual_review_enabled.target_user_ids` already gates who sees the module, so it works for a phased rollout (Pilot → Phase 2 → GA). The name "Pilot Access" was too narrow. However, the flag itself does **not** decide *which* form a user sees; the form is the template resolved on that user's `annual_review_instance` for the selected cycle (`COALESCE(template_override_id, template_id)` via `resolveTemplateId`). So the new column reads that resolution — it does not add a new assignment mechanism.

## Assumptions
- "Form" = the Annual Review **template** resolved for the user in the currently active cycle.
- Users without a seeded instance for the cycle show `— (not seeded)` in the form column; users with an override show the override name + a small "Override" badge.
- No schema change. No new RPC. Template assignment continues to happen via seed rules + `set_annual_review_template_override` (already shipped).
- Master ON/OFF switch stays in Admin → Feature Flags (unchanged).

## Risk & Impact Report
- **Data**: Read-only additions (join `annual_review_instances` + `annual_review_templates` for the active cycle). No writes beyond the existing `target_user_ids` update.
- **Workflow**: None. Rollout gate logic (`AnnualReviewGate`, `is_feature_flag_enabled_for_me`) unchanged.
- **UI/UX**: Card title, description, icon, and current-audience label change from "Pilot" to "Phased Rollout". Preview + audience tables gain an **Assigned Form** column.
- **Regression**: Low. Existing `PilotAccessCard.tsx` filenames/exports are renamed with a re-export shim for one release to avoid breaking imports in `AnnualReviewAdmin.tsx` if any parallel branch references them.
- **Scalability**: Template lookup is one query per render scoped to visible ids (≤ 500 preview rows, ≤ audience count) — same envelope as today's `has_kra` probe.

## Plan

1. **Rename component + copy** in `src/components/annual-review/PilotAccessCard.tsx`
   - Export `PhasedRolloutCard` (keep `PilotAccessCard` as a thin re-export for one release).
   - Card title → **"Phased Rollout — Annual Review"**.
   - Description → *"Roll the Annual Review module out in phases. Pick who sees it now; the rest of the org stays gated. Admins always have access. Master switch: Admin → Feature Flags."*
   - Current audience label → **"Users in current phase"** (badge count unchanged).
   - Buttons stay `Add selected` / `Add all`; add secondary label copy "add to current phase".

2. **Active cycle selector** (top of card)
   - Small `Select` bound to `annual_review_cycles` where `status IN ('active','draft')`, default = active cycle.
   - Drives the form-resolution query below. Persists in component state only.

3. **New "Assigned Form" column** in both tables (Preview + Current audience list)
   - New hook `useAssignedForms(userIds, cycleId)` colocated in the same file:
     - Query `annual_review_instances` for `(employee_id in userIds, cycle_id = cycleId)` selecting `employee_id, template_id, template_override_id, template:annual_review_templates!template_id(name), override_template:annual_review_templates!template_override_id(name)`.
     - Returns `Map<userId, { name: string; isOverride: boolean } | null>`.
   - Preview table: new column between **KRA** and **Status** — shows template name, "Override" badge when applicable, or muted `— not seeded` when no instance exists.
   - Current audience: switch from Badge chips to a compact table (Name, Code, Assigned Form, Remove) so the form is visible per user. Preserves remove-chip behavior via a row action.

4. **Feature Flags tab notice update** in `src/components/admin/FeatureFlagsTab.tsx`
   - Change the read-only notice text from "Manage pilot users…" to **"Manage phased rollout in Annual Review → Settings"**. Link target unchanged.

5. **Docs & policy**
   - `src/modules/annual-review/DOCUMENTATION.md` — rename section to "Phased Rollout UI", note the Assigned Form column and its resolver (`COALESCE(template_override_id, template_id)`).
   - `src/modules/annual-review/POLICY.md` §AR-PILOT-ALLOWLIST → rename anchor to §AR-PHASED-ROLLOUT (keep old anchor as an alias comment for one release). Clarify: flag gates visibility only; form is resolved per instance.
   - Append Version History entry.

### UI Changes
- **Location**: Annual Review → Settings tab, same card position.
- **Header**: title "Phased Rollout — Annual Review"; description as above; adds a cycle selector on the right of the header row.
- **Preview table columns**: Select, Employee, Grade, Level, Department, BU, KRA, **Assigned Form** (new), Status.
- **Current audience**: replaces chip strip with a compact table (Name/Code · Assigned Form · Remove). Empty state copy: "No users in the current phase yet."
- **Responsive**: Assigned Form column truncates with tooltip on mobile; audience table becomes horizontal-scroll.

### Technical Details
- No schema change, no new RPC, no migration.
- `useAssignedForms` uses the same `supabase` client and dedupes ids; batched with `.in()` and capped at 500 (matches preview limit).
- The "Override" badge is derived from `template_override_id != null` — no extra query.
- No change to gate hook, seeder, or `resolveTemplateId`.

### Tests
- Unit test for `resolveAssignedForm(instance)` helper: returns override name when set, base template name otherwise, `null` when instance missing.
- Existing filter/merge tests unchanged.
- Mock rows: (a) user with instance + no override, (b) user with instance + override, (c) user with no instance for cycle.

## Rollback
- Revert the two file edits; keep `PilotAccessCard` re-export for one release then remove. No DB changes to undo.

## Not Applicable
- Migrations, edge functions, cron, RLS changes.
