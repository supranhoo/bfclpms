## Goal
On each System Score card, show the **achievement value (formatted per KPI type)** alongside the derived rating, so users see what was actually measured — not just an opaque point number.

## Current state
`SystemScoresPanel.tsx` cards render:
- Title / description
- `Contributes X / max points`
- (Only if bands present) `Raw: <number> · Rating N/5`
- Right-side big number = the *scaled points* (e.g., `15.00`)

The raw achievement (e.g., `90`) and its formatted meaning (e.g., `90%`, `Yes`, `0 incidents`) is invisible to reviewers on manual + hydrated slots.

## Change (UI-only)
Update the non-carry branch of `SystemScoresPanel` (lines ~83–155) to render an **Achievement** row on every card that has a raw value or bands-derived value, formatted by `s.uom_type` (already on `TemplateSystemScore`):

| uom_type    | Format                                    | Example        |
|-------------|-------------------------------------------|----------------|
| `percent`   | `{n}%` (coerce 0.9 → 90 via existing `coercePercentRaw`) | `90%`          |
| `binary`    | `Yes` / `No` (raw ≥ threshold ⇒ Yes)      | `Yes`          |
| `days`      | `{n} days`                                | `48 days`      |
| `count`/`rating`/default | `{n}`                        | `12`           |

Layout per card:
```
Annual Production Target vs Actual
Scoring: 5=100%, 4=95%, 3=90%, 2=85%, 1=80%, 0=<80%
Achievement: 90%    →    Rating 3 / 5
Contributes 15.00 / 25 points
[progress bar]
```

The right-side big number stays (points), but a new **Achievement** line appears prominently above `Contributes …`. When no raw value is recorded yet, show `Achievement: —` with the existing hint text.

For Carry KRA cards, the `Achieved` metric already exists — no change.

## Files
- `src/components/annual-review/SystemScoresPanel.tsx` — add small `formatAchievement(raw, uom_type)` helper and render the new line.
- `src/components/annual-review/SystemScoresPanel.test.tsx` (new) — unit tests for the formatter across `percent` (integer + 0.9 coercion), `binary`, `days`, `count`, and missing-raw cases.

## Non-goals / risks
- No scoring / data-model / migration changes. Points math is untouched.
- No change to bulk-upload, hydration, or the KPI Library.
- Read-only surfaces (employee/self view) and editor surfaces both benefit from the same render path.
- Zero regression risk to `final_score` — display-only.

## Verification
- Vitest for the formatter.
- Manual check on Ali Ahmad (100870) — Annual Production card should read `Achievement: 90%` → `Rating 3/5` → `Contributes 15.00 / 25`.
