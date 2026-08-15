# Peoplebox-style Alignment & Conversations (Beta) — ADR-276

I cannot watch video or listen to audio. I read the video's page instead: it is the **Peoplebox quick demo** — a unified platform for OKRs (cross-functional goal alignment), reviews auto-populated from goal data, 1:1s and check-ins, and engagement surveys. This plan covers the two capabilities you picked — **OKR alignment layer** and **1:1s / check-ins** — as a **flag-gated beta**, with zero impact on the running annual cycle.

## What already exists (verified)

- `bu_goals` already models Category → KRA → Goal → Sub-goal with `parent_goal_id`, `depth`, `entity_level` (org / bu / department / individual), `owner_profile_id`, weighted roll-up, `tracking_method` (manual / rollup / source), visibility and archiving.
- Goals are served by the paged `bu_goal_list` RPC and rendered in the Performance Console `GoalsTab`, scoped by year / period / BU / department / category.
- The console is already behind an admin feature flag (`admin_feature_flags`).
- There is **no** 1:1, check-in, agenda or action-item capability anywhere in the app.

So the OKR layer is an extension of what exists, not a rebuild. 1:1s and check-ins are new.

## Risk & Impact Report

- **Data impact:** additive only. Three new tables plus a few nullable columns on `bu_goals`. No change to `kpis`, `annual_review_*`, scores, or any review table. No historical data rewritten.
- **Workflow impact:** none for the annual cycle. Goals stay descriptive — they never grade anyone and never feed a review score. 1:1s and check-ins are private manager/employee records with no workflow stage.
- **UI/UX:** two new tabs inside the Performance Console (Alignment, Conversations) plus one employee-facing "My 1:1s" page. Existing screens untouched except the console tab bar.
- **Regression risk:** low. Everything sits behind the beta flag; when off, no new query runs.
- **Scalability:** every list is server-paged through an RPC (same contract as `bu_goal_list`, 200/page). No client-side full-table loads. The alignment tree loads one level at a time with child-count badges.
- **Rollback:** flag off hides the feature instantly; migrations are additive, so the new tables can be dropped without touching existing data.

## Phase 1 — OKR alignment layer

Turns today's flat, scope-filtered goal list into a real cascade.

1. **Alignment link** — add `aligns_to_goal_id` to `bu_goals`, distinct from `parent_goal_id` (which stays the structural Category/KRA nesting). This is what lets a department goal align up to a BU goal and a BU goal to a company goal, across categories — the cross-functional part of the demo.
2. **Goal period + health** — add `start_date`, `end_date`, and `status` (on_track / at_risk / off_track / achieved / dropped), auto-derived from progress vs time elapsed and manually overridable with a reason.
3. **Alignment tree view** — new **Alignment** tab: company → BU → department → individual, each node showing owner, weighted progress bar, health chip, and count of aligned children. Children load on demand via a paged RPC. Filters reuse the existing multi-select cascading scope toolbar (ADR-229 filter standard).
4. **Auto progress from existing data** — extend roll-up so a goal with `tracking_method = 'rollup'` pulls from mapped employee KPI actuals for the period. Recompute on demand plus the existing nightly job pattern; `rollup_computed_at` already exists and is surfaced as a staleness marker.
5. **Alignment gaps panel** — goals with no aligned parent, owners with no goal, and goals whose child weights do not sum to 100. Read-only diagnostics, deep-linked to the fix screens.

## Phase 2 — Check-ins

Lightweight periodic goal updates between formal reviews.

- New table `goal_check_ins`: goal, author, period key, current value, status, blocker note, timestamp. One row per goal per period (unique key = idempotent, safe to re-run).
- A goal owner posts a check-in from the Alignment tree or a **My Goals** card; the check-in writes back `current_value` and `status` through an RPC (RPC-only writes, per the safety baseline).
- Cadence (weekly / fortnightly / monthly) is configured per cycle in admin settings — no hardcoded cadence.
- Overdue check-ins raise a badge in the console and feed the existing notification dispatch queue (batched, honouring inactive-recipient suppression).

## Phase 3 — 1:1s

- New tables `one_on_ones` (manager, employee, scheduled_at, status) and `one_on_one_items` (talking point / note / action item, owner, due date, done flag, author).
- **Conversations** tab in the console for managers: upcoming and past 1:1s across the team, open action items, and a "no 1:1 in N days" nudge list.
- **My 1:1s** page for employees: a shared agenda both sides can add to before the meeting, a private-notes field visible only to its author, and action items carried forward automatically to the next 1:1 until closed.
- Auto-populated agenda: each 1:1 opens pre-filled with the employee's at-risk goals, overdue check-ins and open KPI queries — the "reduce admin work" part of the demo.

## Phase 4 — Feed it back into reviews (optional, after 1–3 land)

A read-only panel on the annual review form showing the employee's goal outcomes, check-in history and 1:1 action-item completion for the cycle. Purely contextual — it does not alter any score, weight or workflow stage.

## Security

- All new tables: RLS enabled, explicit GRANTs, writes through `SECURITY DEFINER` RPCs only.
- 1:1 content readable by exactly the two participants plus admin / HR-PMS; private notes by the author alone. Goal visibility honours the existing `kpi_goal_visibility` enum.
- Every mutation writes to the canonical audit log.

## Technical notes

- Migrations: additive columns on `bu_goals`; new tables `goal_check_ins`, `one_on_ones`, `one_on_one_items`; new RPCs `bu_goal_alignment_tree`, `bu_goal_alignment_gaps`, `goal_check_in_upsert`, `one_on_one_upsert`, `one_on_one_item_upsert` — all paged and authorization-gated like `bu_console_can_read`.
- Frontend: new tabs under `src/components/admin/bu-console/`, hooks added to `useBuConsole.ts`, employee page under `src/pages/`.
- Flag: reuse `admin_feature_flags` with a new key so Alignment and Conversations can be switched on independently of the console itself.
- Tests: unit tests for alignment roll-up maths, health derivation, check-in idempotency and action-item carry-forward, with mock data covering happy path and failure states.
- Docs: ADR-276, DOCUMENTATION.md and POLICY.md updated in the same step (§GOAL-ALIGNMENT-NON-GRADING, §CONVERSATION-PRIVACY).

## Suggested build order

Phase 1 first (foundation, reuses the most existing code), then Phase 2, then Phase 3. Phase 4 only after you have seen the first three in use.