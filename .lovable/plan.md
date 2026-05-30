Phase 12: Enable SLA v2 + QA
==============================

## What this does
1. **Flip `ui_safety_sla_v2` from `false` → `true`** in the safety_settings table.
2. **Visual QA walkthrough** on `/safety/settings/sla`:
   - Confirm the "At-Risk Queue" card mounts above the escalation history table.
   - Check that red/amber badge counts and countdown labels render correctly.
   - Click an incident link → verify navigation to `/safety/incidents/{id}` works.
   - Verify the existing "Run now" button and history table are unchanged.
3. **Rollback check**: Flip back to `false` and confirm the queue card disappears, restoring the v2.66.13.25 layout.

## Risks
- **Data impact:** None — single-row toggle in `safety_settings`. No schema or data migration.
- **UI/UX impact:** Read-only additive surface. The existing Phase 1.D history table and "Run now" control remain untouched.
- **Regression risk:** Minimal — the queue card derives from cached `useSafetyIncidents()` (already used elsewhere in Safety). The 43 safety tests pass; the no-writer guard ensures no new mutation paths.
- **Rollback:** Immediate — set `ui_safety_sla_v2 = false`.

## Steps after approval
1. Update the row via `supabase--insert` (UPDATE).
2. Navigate to `/safety/settings/sla` in the preview.
3. Screenshot / observe the queue card.
4. Note any issues in QA notes.
5. Flip back to `false` and confirm clean removal.
6. Update `DOCUMENTATION.md`, `POLICY.md`, and memory with QA sign-off.