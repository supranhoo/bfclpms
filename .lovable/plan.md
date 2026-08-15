# ADR-276 — Objective Tree: one clean KRA/KPI cascade (Org → BU → Dept → Employee)

Reference: the Peoplebox "My Goals" screen you shared. What makes it readable is not the
feature set — it is the **single indented tree with one row per objective**, and everything
else compressed into that row: title, due date, aligned-count chip, level badge, owner
avatar, status chip, progress bar, percentage. Nothing else on screen. Updating progress is
one small popover on the row (value, status, optional context note), not a page.

Our current Goals tab is a separate table with its own vocabulary, which is why it reads as
cluttered and disconnected. This plan replaces it.

## Naming decision (locked)

- Drop the word **goal** from the UI entirely. KRA and goal mean the same thing here.
- The tree is called the **KRA Tree**; each row is a **KRA** (a parent/aggregate objective)
  or a **KPI** (a measurable leaf with a target).
- Levels reuse the words we already use: **Organisation / Business Unit / Department /
  Employee** — the same four levels as `entity_level` on `bu_goals` today
  (org / bu / department / individual), so no data migration is needed for the level idea.
- The table stays `bu_goals` internally (renaming a live table buys nothing); every label,
  route, tab and heading says KRA / KPI.

## The one screen

```text
KRA  Achieve FY27 organisation production target       Org   AK   BEHIND    44%
 └ KRA  CPP power generation                            BU    RS   AT RISK   45%
    └ KPI  45 MW AFBC — 300,000 MT            3 mapped  Dept  SK   ON TRACK  60%
    └ KPI  45 MW WHRB — 260,000 MT            5 mapped  Dept  MP   ON TRACK  72%
    └ KPI  8 MW — 60,000 MT                             Emp   JD   NOT SET    0%
```

Row anatomy, copied from the reference:

- caret to expand/collapse; indentation is the only structure cue (no cards, no boxes)
- title on the left, cycle/due underneath in small muted text
- "N mapped" chip where a KPI pulls from employee KPI rows (their "N aligned goals")
- level badge with an icon, owner avatar, status chip, thin progress bar, big % on the right
- click the row → right-side drawer with detail; click the progress area → **Check-in popover**

**Check-in popover** (exactly the reference interaction): current value `of` target, a status
select (On track / At risk / Behind / Achieved / Dropped), an optional context note with
@mention support reusing our existing mention infrastructure, Cancel / Check in. One click,
no navigation, stays on the tree.

## Mapping, the same way we map KRA

A KRA/KPI row is mapped to exactly one level, and the picker mirrors the KRA assignment flow
people already know:

| Level | Scope fields | Progress source |
|---|---|---|
| Organisation | company | roll-up of child rows |
| Business Unit | business unit | roll-up of children, or employee KPI rows in that BU |
| Department | BU + department | roll-up of children, or employee KPI rows in that dept |
| Employee | owner profile | employee KPI rows for that person, or manual check-in |

- Every row has one **owner** (a profile) — that is who checks in and who the avatar shows.
- **Alignment** is a new `aligns_to_id` link, separate from the structural `parent_goal_id`,
  so a department KPI can align up to a BU KRA in a different category — cross-functional
  alignment, and the source of the "N aligned" chip.
- Depth is no longer capped at one level; the tree allows Org → BU → Dept → Employee (max 4)
  with a server-side cycle guard.

## What gets removed to kill the clutter

- The standalone Goals tab, its table layout, and the words goal / sub-goal in the UI.
- Duplicate scope controls: the tree uses the console's existing multi-select cascading
  scope toolbar (ADR-229 standard) and a cycle selector, nothing more.
- Columns that repeat what the badge already says (tracking method, summary rule, source)
  move into the detail drawer instead of the row.

## Phase 1 — KRA Tree (replaces the Goals tab)

1. Schema (additive): `aligns_to_id`, `status`, `start_date`, `end_date`, `owner_profile_id`
   already exists. Allow depth up to 4 with a cycle guard in `bu_goal_upsert`.
2. New paged RPC `kra_tree_list` — returns one level at a time with child counts, owner name,
   resolved progress, status, and mapped-employee count. No client-side full loads.
3. `KraTree` component: virtualised rows, expand-on-demand, sticky header row of column
   labels, mobile layout collapsing badges under the title.
4. Status derivation: on track / at risk / behind computed from progress vs elapsed cycle
   time, overridable manually with a stored reason; "Not set" when there is nothing to
   measure (never a fake 0%).
5. Create/edit dialog reshaped as the KRA mapping flow: Level → Scope → Owner → Category/KRA
   → optional KPI link → target/unit → alignment parent.

## Phase 2 — Check-ins

- New table `kra_check_ins`: row id, author, period key, value, status, context note,
  timestamp; one row per objective per period (idempotent).
- Written only through an RPC, which also updates `current_value`/`status` on the objective.
- Cadence (weekly / fortnightly / monthly) configured per cycle in admin settings.
- Row shows "Updated 3 Jun" like the reference; overdue check-ins get a subtle marker and
  feed the existing batched notification queue.
- History of check-ins is visible in the detail drawer as a small sparkline + list.

## Phase 3 — 1:1s

- Tables `one_on_ones` (manager, employee, scheduled_at, status) and `one_on_one_items`
  (talking point / note / action item, owner, due date, done, author).
- **My 1:1s** page for employees and a manager view listing upcoming/past 1:1s and open
  action items.
- Agenda auto-fills with the employee's at-risk KRAs, overdue check-ins and open KPI queries.
- Private notes visible only to their author; action items carry forward until closed.

## Risk & Impact

- **Data:** additive columns plus two new tables. `bu_goals` currently holds no production
  data worth preserving in its old shape, and no review, KPI or score table is touched.
- **Workflow:** none. A KRA/KPI row in this tree states intent and tracks progress; it never
  grades anyone and never feeds a review score or workflow stage.
- **UI/UX:** the Goals tab is replaced by the KRA Tree inside the Performance Console; one
  new employee page for 1:1s. No other screen changes.
- **Regression:** everything stays behind the console beta flag, with a separate flag for
  check-ins and 1:1s.
- **Scalability:** level-by-level paged RPCs, virtualised rows, no unbounded reads.
- **Rollback:** flag off; the added columns and new tables can be dropped without touching
  existing data.

## Security

- New tables: RLS on, explicit GRANTs, writes via `SECURITY DEFINER` RPCs only.
- Tree reads gated by `bu_console_can_read`; employees see their own and their chain's rows.
- 1:1 content readable only by the two participants plus admin / HR-PMS; private notes by the
  author alone. Every mutation writes to the canonical audit log.

## Tests and docs

- Unit tests: roll-up maths across 4 levels, alignment cycle guard, status derivation,
  check-in idempotency, action-item carry-forward — happy path and failure states.
- ADR-276 supersedes the goal-shape sections of ADR-263 and ADR-267; POLICY gains
  §KRA-TREE-NON-GRADING and §CONVERSATION-PRIVACY; DOCUMENTATION.md version history updated
  in the same step.

## Two things worth confirming before build

1. **Who may create an Org/BU-level KRA?** Proposal: admin and BU head create at their level
   and below; managers create employee-level rows for their team; employees can only check in.
2. **Cycle basis** — proposal: reuse the existing fiscal July–June cycle and review periods
   rather than introducing free-date OKR cycles, so the tree lines up with everything else.

If you are fine with both proposals, no further input is needed to start Phase 1.