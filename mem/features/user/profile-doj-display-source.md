---
name: Profile DOJ Display Source
description: Profile Overview and Hero must read profiles.doj for Date of Joining, never profiles.created_at
type: feature
---
- Any UI surface labelled "Date of Joining" or "Joined …" MUST bind to `profiles.doj`.
- `profiles.created_at` is the row-insert audit timestamp — never present it as a business date.
- Affected surfaces: `src/pages/ProfileSettings.tsx` (orgInfo.joiningDate) and `src/components/profile/ProfileHero.tsx` (Joined chip). Edit User dialog already binds to `doj` correctly.
- Regression guard: `src/test/profileJoiningDateSource.test.ts`.
- Originally fixed after Binay Singh (102013) showed `23 May 2026` on Overview vs `15-May-2026` in Edit dialog — the 8-day gap was the profile row's created_at.