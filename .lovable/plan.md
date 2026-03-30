

## RCA: Admin Data Entry — Final Score Not Populated on Approval

### Root Cause

In `useAdminDataEntry.ts` (lines 293-327), when admin data entry advances a KPI to `approved`, the `final_score` sync is done via a **separate `.update()` call** (line 307) AFTER the initial upsert. This creates two failure vectors:

1. **Param passthrough fragility**: The sync uses `score` and `rating` from the mutation params directly. If `calculatedScore` was `null` at submit time (e.g., score loaded from existing data but `calculatedScore` state not properly set during role-level switching), `final_score` gets explicitly set to `null`.

2. **Two-step write risk**: The upsert at line 170 writes role-level fields, then a separate `.update()` at line 307 writes `final_score`. If the second update silently fails (RLS edge case, network issue), the KPI is marked `approved` but `final_score` remains null. The error is only `console.error`'d, not surfaced to the user.

The Fast Track path (line 746-749) does NOT have this bug because it includes `final_score` directly in the upsert payload — a single atomic write.

### CAPA (Corrective and Preventive Action)

**Corrective — File: `src/hooks/useAdminDataEntry.ts`**

1. Move the `newStatus` resolution BEFORE the upsert (lines 222-291 currently run after upsert)
2. When `newStatus === 'approved'`, include `final_score` and `final_rating` directly in the upsert's `updateFields` — eliminating the separate update
3. After the upsert, if `newStatus === 'approved'`, re-read the submission to verify `final_score` is populated. If null, compute it from the terminal reviewer's score in the submission row (8-stage fallback chain) and do a corrective update
4. Remove the now-redundant separate `.update()` block at lines 306-319

**Logic change (pseudocode)**:
```text
1. Resolve newStatus FIRST (move workflow resolution before upsert)
2. If newStatus === 'approved':
   a. Add final_score = score, final_rating = rating to updateFields
3. Upsert with all fields in ONE call
4. Update kpi.status if newStatus is set
5. Verify: if approved and upserted row's final_score is null, 
   fallback: read terminal reviewer score from row and patch
```

**Preventive — File: `POLICY.md`**

Add invariant: "Admin data entry must write `final_score` atomically in the same upsert that writes role-level data when advancing to `approved`. A separate update for `final_score` is prohibited."

### Files Changed
| File | Change |
|------|--------|
| `src/hooks/useAdminDataEntry.ts` | Move workflow resolution before upsert; include final_score in upsert when approving; add verification fallback |
| `DOCUMENTATION.md` | Version history v2.13.7 |
| `POLICY.md` | Add atomic final_score sync invariant |

### Risk Assessment
- **Regression**: Zero — same data written, just in fewer DB calls
- **Scope**: Admin data entry path only; Fast Track and normal scorecard flows unaffected
- **Edge cases**: Fallback verification ensures final_score is always populated on approval

