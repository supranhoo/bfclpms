## Problem

The "Change head" dialog has a Search input and a separate Select dropdown. The Select is a native-style Radix Select that does NOT consume the search term until the user opens it — and even then, typing inside the trigger jumps via first-letter keyboard nav instead of filtering. The two controls are visually disconnected and the user can't tell that typing into Search narrows the dropdown.

## Fix

Replace the split "Search + Select" with a single **searchable combobox** (Popover + Command pattern already used elsewhere in the app, e.g. shadcn `Command` + `CommandInput`).

### Behavior
- Single trigger button shows current pick ("Pick someone" placeholder).
- Click → popover opens with a search input at top and a scrollable list below.
- Typing filters by `full_name` OR `employee_code` (case-insensitive, same logic as today).
- Each row shows: `Name (employee_code) — Department · BU` (unchanged context line).
- Empty state: "No employees found".
- Cap render to 200 matches (unchanged).
- Selecting closes the popover and sets `pickUserId`.

### Files to change (surgical)
1. `src/components/admin/BuHeadColumn.tsx` — swap the Search `<Input>` + `<Select>` block for a `<Popover>` containing `<Command><CommandInput/><CommandList><CommandEmpty/><CommandGroup>…<CommandItem/></CommandGroup></CommandList></Command>`. Remove the separate `searchTerm` Input; keep the filter logic but drive it off the `CommandInput`.
2. `src/components/admin/HrFinalizationCard.tsx` — apply the identical combobox replacement for the HR head picker (same UX bug exists there per code read).

No changes to services, queries, mutations, RLS, or schema. No DB migration. No business logic change.

### Out of scope
- BU-select dropdown in HrFinalizationCard (line 116) — only ~N items, search not needed.
- Recalc/save behavior, audit log, validation rules — unchanged.

## Risk & Impact

- **Data**: none.
- **UI**: dialog gains a combined search-and-pick control; reason textarea, Save/Cancel unchanged.
- **Regression**: low — Popover+Command is already used across the project; selection still writes `pickUserId` the same way, so `setBuHead`/`setHrHead` calls are unchanged.
- **A11y**: Command provides keyboard nav + screen-reader labels out of the box.
- **Perf**: still capped at 200 rendered rows; filter runs in-memory over already-loaded `activeProfiles`.

## Verification

- Open dialog → type "saj" → list narrows to Sajid Raza in real time.
- Type employee code "100264" → same row appears.
- Pick row → trigger shows the name, Save enables once reason ≥ 3 chars.
- Repeat in HR Finalization card.

## Docs

- `mem/features/admin/org-heads.md` — one-line note that the picker uses a searchable combobox (Popover + Command).
- No POLICY.md change (no business rule change).
