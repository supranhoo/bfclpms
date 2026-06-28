## Risk & Impact Report

- **Data impact:** None — read-only display fix. `profiles.doj` and `profiles.created_at` already exist; no schema/RLS changes.
- **Workflow impact:** None. No scoring, eligibility, or workflow rule consumes these two display sites.
- **UI impact:** Overview > Organization Details > "Date of Joining" and ProfileHero "Joined …" chip will now show the true DOJ for every user (not just Binay). For users whose profile was created on a different day than they actually joined, the visible date will change — this is the correction, not a regression.
- **Regression risk:** Low. Both surfaces already handle `null`; we keep that branch.
- **Scalability:** No new queries; `doj` is already on the loaded profile row.

## Root cause (confirmed against DB)

For `employee_code = 102013` (Binay Singh):
- `profiles.doj = 2026-05-15` → Edit User dialog (correct).
- `profiles.created_at = 2026-05-23` → Overview card + Hero chip (wrong source).

Two display sites read `profile.created_at` (the row-insert timestamp) instead of `profile.doj`:

1. `src/pages/ProfileSettings.tsx` line 121 — `joiningDate: profile?.created_at || null`
2. `src/components/profile/ProfileHero.tsx` lines 135–137 — `Joined {format(new Date(profile.created_at), 'MMM yyyy')}`

The Edit User dialog binds to `doj` directly, which is why it shows the correct `15-May-2026`. This bug affects **every employee** whose profile row was inserted on a date different from their joining date (bulk imports, backfills, re-creations after the identity-repair batch on 2026-06-25, etc.) — not just Binay.

## Fix plan (surgical, presentation-only)

### Step 1 — `src/pages/ProfileSettings.tsx`
Replace the `orgInfo` joining-date source:

```ts
joiningDate: (profile as any)?.doj || null,
```

(Cast mirrors the existing pattern used on lines 118–119 for `employee_category` / `employment_status`.)

### Step 2 — `src/components/profile/ProfileHero.tsx`
Replace `profile.created_at` with `profile.doj` in the "Joined …" chip, keep the null-guard:

```tsx
{profile?.doj && (
  <Badge …>
    <Calendar className="h-3 w-3" /> Joined {format(new Date(profile.doj), 'MMM yyyy')}
  </Badge>
)}
```

No other call sites of `profile.created_at` for DOJ purposes exist (`rg` confirmed).

### Step 3 — Regression test
Add `src/test/profileJoiningDateSource.test.ts` asserting:
- `OrganizationInfoCard` renders the `joiningDate` prop value formatted, and
- a small helper (or direct render assertion) confirms `created_at` is **not** used when `doj` is present, **and** the "—" placeholder is shown when both are null.

### Step 4 — Docs
- `DOCUMENTATION.md` → Version History entry: "Profile Overview/Hero now display `profiles.doj` (true Date of Joining), not `profiles.created_at` (record-insert timestamp)."
- `POLICY.md` → under Profile Display: "DOJ surfaces MUST bind to `profiles.doj`. `created_at` is an audit timestamp and must never be presented as a business date."
- New memory `mem/features/user/profile-doj-display-source` capturing the SSOT rule.

## Out of scope
- No change to Edit User dialog (already correct).
- No backfill — DB values are already correct; only the display was wrong.
- No change to any scoring/workflow path.

## Rollback
Pure two-line revert in the two files above; no data migration to undo.
