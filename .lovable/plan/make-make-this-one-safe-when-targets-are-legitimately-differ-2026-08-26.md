# Make "Make this one" safe when targets are legitimately different

## Your read is right

In the SOP/SMP case the 6 variants are two different things mixed together:

- **Wording drift** — the same description repeated, formula written slightly differently
  ("(Number of SOPs...)" vs "Number of SOPs..."), one variant carrying a percentage formula.
- **Real per-person scoring** — target 5 / 7 / 10 with matching rating bands
  ("5 for 5, 4 for 3..." vs "5 for 10, 4 for 8..."). That is a deliberate individual bar.

Today "Make this one" writes all four fields — description, formula, scoring logic **and target** —
so choosing Variant 1 would push target 5 and its bands onto the people who legitimately carry 7 and
10. The action would destroy exactly the differentiation the KPI was designed around.

Two corrections are needed: the tool must stop treating target/bands as drift, and the per-employee
bar must live somewhere that survives standardisation — the scoring ladder built in ADR-324.

## The correction

**1. Split variance into two classes.**

- *Text drift* — description, formula wording, scoring-logic wording. Safe to standardise for
  everyone (already classified as descriptive under ADR-321/323).
- *Scoring difference* — `target_value` and the R0–R5 bands. Never flattened by a standardisation.

The console badge reads, for the example above: **"6 variants — 3 wording, 3 different targets"**.

**2. "Make this one" becomes "Standardise wording".**
It writes only the three text fields and explicitly reports "targets left untouched (5, 7, 10)".
The variant list stays after the run when targets still differ — and that is correct, not a failure.

**3. Add "Flatten targets too" as a separate, deliberate action.**
Same dialog, second tab, off by default, requires typed confirmation and lists every employee whose
target changes and from what to what. This is the only way a target is ever equalised.

**4. Route real differences to the ladder.**
When the dialog detects target/band variance it offers **"Turn these into scoring tiers"**: it
pre-builds ladder tiers from the existing variants (Target 10 tier, Target 7 tier, Target 5 tier),
each seeded with the employees currently on that variant as named-employee or level/designation
matches, so the differentiation becomes governed configuration instead of accidental drift.
After that, one canonical wording + one ladder = 1 variant, targets intact.

**5. One-off exceptions stay in Tune.** A single person off-ladder keeps using the existing
per-employee override, which already marks the field as hand-tuned and is skipped by group edits.

## How the UI looks

Dialog title: **Align "SOP/SMP Creation & Implementation"** with two tabs.

```text
┌ Align — SOP/SMP Creation & Implementation ─────────────────────── x ┐
│ 6 variants:  3 differ only in wording   |   3 carry a different bar │
│ [ Standardise wording ]  [ Targets & bands ]                        │
├─────────────────────────────────────────────────────────────────────┤
│ Canonical wording                                                   │
│ ( • ) Variant 1  2 employees            [Wording source]            │
│       Description: Ensures that standardized, safe operating ...    │
│       Formula:     (Number of SOPs or SMP's created ...)            │
│       Scoring text: ( 5 for <target>, 4 for ... )                   │
│ ( ) Variant 5  1 employee   — formula uses a % calculation          │
│                                                                     │
│ Description [ ................................................. ]   │
│ Formula     [ ................................................. ]   │
│ Scoring text[ ................................................. ]   │
│                                                                     │
│ Targets in this group:  5 (3 people) · 7 (2) · 10 (1)               │
│ ✓ Targets and rating bands are not written by this action.          │
│   → Manage the different bars as scoring tiers                      │
│                                                                     │
│ Apply to: [ This month only ▾ ]                                     │
│                       [ Cancel ] [ Preview ] [ Standardise wording ]│
└─────────────────────────────────────────────────────────────────────┘
```

Preview panel reads: `9 rows will change · 0 skipped · wording only · targets unchanged ·
variants after apply: 3 (by target)`.

The **Targets & bands** tab is a table, one row per employee:

```text
Employee            Current target   Bands            New target
Rakesh Gupta        10               5 for 10, 4 ...  [ 10 ]  (unchanged)
Anup Kumar          7                5 for 7, 4 ...   [ 7  ]  (unchanged)
...
[ ] Set every employee to a single target  →  [   ]   type APPLY to confirm
[ Build a scoring ladder from these targets instead ]
```

The KPI row badge changes from a flat amber "6 variants" to
`6 variants · 3 wording` (amber, actionable) + `3 targets` (neutral grey, informational),
so a KPI whose only variance is deliberate targets no longer looks like a defect.

## Technical notes

- `variantNormalise.ts`: `VARIANT_FIELDS` splits into `WORDING_FIELDS`
  (`kpi_description`, `kpi_formula`, `kpi_scoring_logic`) and `SCORING_FIELDS`
  (`target_value`, `r0..r5`). `buildNormalisePlan` takes a mode
  (`'wording' | 'targets'`), and in wording mode never emits a scoring field.
  `predictedVariantCount` becomes target-aware: the count after a wording run is the number of
  distinct target/band groups, not 1.
- New `classifyVariance(variants)` returns `{ wordingGroups, targetGroups }`, consumed by both the
  dialog header and the `BuConsoleTree` badge.
- Variant rows already expose `target_value`; the R0–R5 bands need to come back with the variant
  payload from the console tree RPC so the targets tab can show them (read-only addition to the
  existing select, no schema change).
- `VariantNormaliseDialog.tsx`: two-tab layout, wording tab as default; targets tab reuses the
  existing typed-confirmation control. Contained modal, `min-w-0`, wrap-safe (ADR-314).
- Ladder handoff: a `seedTiersFromVariants(variants)` helper in `scoringLadderModel.ts` produces
  `LadderTier[]` (one per distinct target, `match_dimension: 'employee'` when a variant covers a
  single person, otherwise a named tier the admin re-points at a level/designation), handed to
  `ScoringLadderDialog` pre-filled and unsaved.
- Server: no new RPC. Wording runs are descriptive-only, so `bu_console_group_edit_definition`
  already takes the ADR-323 automatic-bypass path; target runs carry `target_value` and stay under
  the existing lock/immutability guards (§88).

## Tests

- `variantNormalise.test.ts` — wording mode never emits `target_value`/bands; target mode requires
  explicit opt-in; `classifyVariance` splits the 6-variant SOP case into 3 wording + 3 target
  groups; predicted count after a wording run equals the target-group count.
- `scoringLadderModel.test.ts` — `seedTiersFromVariants` produces one tier per distinct target,
  preserves bands, and orders single-employee tiers ahead of the fallback.
- `consoleLayout.test.tsx` — the two-tab dialog does not overflow horizontally.

## Docs

`docs/adr/ADR-325.md`, DOCUMENTATION.md (Performance Console → variance),
POLICY §CONSOLE-VARIANT-NORMALISE amended: *a normalisation never writes a target or a rating band
unless the admin explicitly opts into a target flattening run*, version history entry.

## Risk

- Data: strictly reduces what the action writes; the destructive path becomes opt-in and confirmed.
- Regression: low — existing group-edit and ladder paths are unchanged; only the normaliser's field
  set and the badge text change.
- Rollback: revert the client modules; no schema or RLS change.
