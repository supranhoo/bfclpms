# Updated Plan — Fix Profile Identity / Duplicate-Email Cleanup

## 1. Assumptions

- The 23-row table in the user's message is the **authoritative decision list**. Each pair represents one real shared email and two real employees; only ONE of them should keep the email going forward.
- DB check confirms only **one `profiles` row exists per email** today; the "second" employee in each pair lives only in `auth.users.raw_user_meta_data` (the original signup truth) and is missing from `public.profiles`.
- "Remove the email ID" = set `profiles.email = NULL` and `has_real_email = false` on that employee; do NOT delete the auth user yet (a separate audit pass will handle orphaned auth rows).
- "Inactive this Employee" = set `profiles.is_active = false`, `deactivated_at = now()`, and clear email.
- Email uniqueness will be enforced going forward by a partial unique index on `profiles(lower(email)) WHERE email IS NOT NULL`.

## 2. Risk & Impact Report

- **Data:** 23 profile rows touched (some re-identified, some created, some inactivated, some email-cleared). All changes are reversible via the new `system_audit_logs` rows the repair RPC writes.
- **Workflow:** Re-identifying a profile (e.g., 101814 HEMA → 101784 Vivek) carries the same `id` into all child rows (reviews, KPIs, submissions). The historical data stays attached to the correct human, since the auth/email truth says it was always Vivek.
- **UI/UX:** Manager/HR tiles, reports, and reminders will immediately show the corrected name/code/photo. No screen change beyond data correction.
- **Scalability:** One-time repair on 23 rows + a unique index. Negligible cost.
- **Regression risk:** Medium until write-paths are hardened (Phase 3). Mitigation: partial unique index on email + BEFORE-UPDATE audit trigger ship in the same migration as the repair.

## 3. Per-Pair Action Table (derived from the user's list)

Legend: **R** = re-identify existing profile to the "keep" employee, **N** = create new profile for the other employee (no email), **C** = clear email on existing row, **I** = inactivate.

| Email | Keep (code → name) | Action on existing profile row | Action on missing employee |
|---|---|---|---|
| anilkumar528989@gmail.com | 200304 Anil Kumar | keep as-is (already correct) | **N** 200321 Manoj Kumar Singh (no email) |
| baleshwarbedia9@gmail.com | 200552 Baleshwar Bedia | **R** existing 200512 → 200552 Baleshwar (keep email) | **N** 200512 Satya Narayan Singh (no email) |
| dashrathmahli598@gmail.com | 100816 Dashrath Mahli | keep as-is | **N** 100819 Usha Devi (no email) |
| dummy@gmail.com | none (all remove) | **C** existing 101898 Basant Prasad → email NULL | **N** 100000 Hari Krishna Budhia (no email); **N** 101711 Dhiraj Kumar Chaturbedi (no email) |
| hasinuhasinu166@gmail.com | 102025 Mohiuddin Ansari | keep as-is | **I**+ensure-no-profile for 100599 Mohiuddin Ansari (mark inactive if auth-only row gets materialised) |
| mahendramahto0406@gmail.com | 100344 Mahendra Mahto | **R** existing 100501 Pankaj → 100344 Mahendra (keep email) | **N** 100501 Pankaj Kumar (no email) |
| ramigope@gmail.com | 100788 Pavan Gope | keep as-is | **N** 200652 Shayam Kishor (no email) |
| sanjaykumarshrivastav927@gmail.com | 200073 Sanjay Kumar Shrivastava | **R** existing 200075 Santosh → 200073 Sanjay (keep email) | **N** 200075 Santosh Baitha (no email) |
| sukhdevsinghsardar62@gmail.com | 101993 Sukdev Singh Sardar | keep as-is | **I** 100247 Sukdev Singh Sardar (duplicate person, inactivate) |
| umesh.singh@bfclalloys.com | 100600 Umesh Kumar Singh | **R** existing 101697 Sudesh → 100600 Umesh (keep email) | **N** 101697 Sudesh Kannah Mohan (no email) |
| vivek.dansena@bfclalloys.com | 101784 Vivek Kumar Dansena | **R** existing 101814 HEMA → 101784 Vivek (keep email, keep avatar) | **N** 101814 HEMA KUMARI (no email, no avatar) |

Net counts: 6 re-identifications (R), 10 new profiles created without email (N), 1 email-clear (C), 2 inactivations (I).

## 4. Step-by-Step Plan

### Phase A — Pre-flight (read-only)

1. Snapshot the 13 existing profile rows + their downstream FK counts (reviews, KPIs, submissions, assignments) and save as `/mnt/documents/profile-identity-repair-preflight.csv`. → **Verify:** counts logged in `system_audit_logs` as `profile.repair_preflight`.

### Phase B — Migration: hardening only (no data change)

2. Add partial unique index `ux_profiles_email_ci ON profiles(lower(email)) WHERE email IS NOT NULL`.
3. Add partial unique index `ux_profiles_employee_code ON profiles(employee_code) WHERE employee_code IS NOT NULL` (already drift-free per the 23-row plan).
4. Add `BEFORE UPDATE` trigger `trg_profiles_identity_audit` on `profiles` that, when `email`, `employee_code`, or `full_name` changes, writes a row to `system_audit_logs` (`action='profile.identity_changed'`, `metadata={old, new, by}`).
5. Add SECURITY DEFINER RPC `repair_profile_identity(p_target_id uuid, p_new_employee_code text, p_new_full_name text, p_new_email text, p_reason text)` — validates uniqueness, performs the update, returns the audit row id. Admin-only via `has_role`.
6. Add SECURITY DEFINER RPC `create_repair_profile(p_employee_code, p_full_name, p_reason)` — creates a profile with `id = gen_random_uuid()`, `email = NULL`, `has_real_email = false`, `is_active = true`, `is_dummy_employee = false`. Admin-only.

→ **Verify:** migration applies; `\d profiles` shows both indexes; RPCs exist; trigger fires (covered by Phase E tests).

### Phase C — Data repair (one batched insert call)

7. For each pair in section 3:
   - **R** rows → call `repair_profile_identity(...)` with the corrected `employee_code`, `full_name`, and email retained.
   - **C** rows → call `repair_profile_identity(...)` with `p_new_email = NULL` and `has_real_email = false` (extend RPC to accept this flag).
   - **N** rows → call `create_repair_profile(...)`.
   - **I** rows → call `repair_profile_identity(...)` with `is_active=false` (extend RPC to accept this flag) and `p_new_email = NULL`. If no profile exists yet, create one via `create_repair_profile` with `is_active=false`.
8. Each call writes one immutable row to `system_audit_logs` with `{ action: 'profile.identity_repaired', before, after, reason, performed_by }`.

→ **Verify:** the diagnostic view `v_profile_identity_drift` returns 0 rows; the duplicate-email view `v_profile_email_duplicates` returns 0 rows; spot-check Vivek's tile shows "Vivek Kumar Dansena (101784)" with his photo, and a new tile for "HEMA KUMARI (101814)" exists with no email.

### Phase D — Write-path hardening (prevent recurrence)

9. **User Management edit form**: on submit, re-fetch the selected profile by id, render a `ConfirmDestructiveDialog` showing `old → new` whenever `full_name`, `employee_code`, or `email` changes; route the actual write through `repair_profile_identity`.
10. **Bulk user import**: switch the row-matching key from `email` to `employee_code`; reject any row whose matched `id` currently holds a different `employee_code`/`full_name` unless the admin opts in with `allowRename: true`.
11. Nightly drift sweep (edge function) compares `auth.users.raw_user_meta_data` vs `profiles` and emails admins when drift > 0.

### Phase E — Tests, docs, policy

12. Vitest cases:
    - `repair_profile_identity` rejects on duplicate `employee_code`.
    - `repair_profile_identity` rejects on duplicate email (case-insensitive).
    - `create_repair_profile` always produces `email=NULL, has_real_email=false`.
    - Trigger writes one `system_audit_logs` row per identity change.
    - Bulk-import matcher rejects mismatched name/code without `allowRename`.
13. Update `DOCUMENTATION.md` → new "Profile Identity Integrity" section (RCA, indexes, trigger, RPCs, drift view) + Version History entry dated 2026-06-25.
14. Update `POLICY.md` → "`profiles.email` is unique (case-insensitive). `profiles.employee_code` is unique. Identity changes (`full_name`, `employee_code`, `email`) must go through `repair_profile_identity` and are always audit-logged. Bulk import matches by `employee_code`, never by `email`."
15. Update memory: extend `mem://features/admin/data-repair-engine` with the new "Profile Identity" repair card.

## 5. UI Changes

- **Admin → Data Repair**: new "Profile Identity Drift" card listing the 23 rows from this plan, each with the chosen action pre-selected; admin clicks **Apply** to execute Phase C in one batch.
- **Admin → User Management → Edit User dialog**: gains a confirm step showing `old → new` for name/code/email; identical look-and-feel to the existing `ConfirmDestructiveDialog`.
- **No other screens change**; corrected names/codes/photos propagate automatically because every consumer reads live from `profiles`.

## 6. Rollback

- Phase B is additive (indexes, trigger, RPCs) — drop them to revert.
- Phase C is reversed by reading the `system_audit_logs` `before` payload and re-applying via the same RPCs.

## 7. Out of Scope

- Cleaning up orphaned `auth.users` rows whose corresponding profile is now inactivated or re-identified (handled in a separate auth-cleanup pass).
- Re-labelling historical snapshot tables (annual review instances, exports) — most consumers read live from `profiles`, so the repair is visible immediately; snapshot tables get a follow-up review pass.
