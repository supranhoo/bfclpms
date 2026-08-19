# Evidence preview hangs for Ashish Kataria (200226) — RCA, 5 Why, CAPA

## What the diagnostics actually say

`status=none name=Error msg=The file server is busy right now… elapsed=20009ms attempts=1 bucket=review-evidence kpi=331c01ff-8b7a-4a5e-90af-a41f2fda33ad class=other`

Read literally: no HTTP status ever arrived, exactly one attempt was made, and the failure fired at the 20 000 ms guard. This is **not** "server busy" and **not** the ADR-298 network-blocked class — it is a **hung request that never returned**, mislabelled as busy.

## Verified against the live system (reads only)

- The KPI is Kamleshwar Kumar (200083) — "Quotation Collection within 3 Days of RF". Two evidence objects exist in `review-evidence`: a **16 KB JPEG** and a 19 KB XLSX. Nothing is missing, and size is irrelevant here.
- Ashish (200226) is a **manager**, and the chain is 200083 → Somnath Roy (200296) → Ashish. `can_read_kpi_evidence()` therefore returns true on its cheap third branch (`mgr.reporting_manager_id = uid`); the expensive skip-level / auditor / org-owner branches are never reached. A 20 s server-side RLS stall is not credible on this path.
- Storage traffic that **does** succeed in the logs is the authenticated object GET (`/storage/v1/object/review-evidence/…`, HTTP 200) used by the download path. The preview path uses a different call — `POST /storage/v1/object/sign/…` — and no successful sign request appears in the retained log window.
- In `EvidencePreviewDialog.tsx` the 20 s timeout is a **single promise raced against the whole retry loop**. When the first sign call hangs, the timeout rejects everything, so the ADR-298 backoff retries (400 ms / 1200 ms) never execute — which is exactly why the diagnostics show `attempts=1`.

## Root cause

The preview depends on a **single call type (signed-URL POST) that is hanging for this client**, with a **global timeout that makes the retry logic dead code** and an **error classifier that reports a hang as "server busy"**. The download path that works for the same object and the same user is never attempted as a fallback.

## 5 Why

1. Preview fails → the 20 s guard fires.
2. Guard fires → the signed-URL POST never returns.
3. Never returns → the request is stalled between the browser and Storage (proxy/extension/connection hold), while the plain authenticated GET for the same object succeeds.
4. The stall is fatal → the timeout races the entire loop, so no retry and no alternative transport is ever tried.
5. Never tried → the preview has exactly one transport and a message vocabulary with no term for "hung", so it reported "busy" and told the user to retry something that can never succeed.

## CAPA

### Corrective (makes the file open)
1. **Fallback transport.** If signing does not return, fall back to `storage.download()` (the authenticated GET that already works) and render from an object URL, capped by file size so ADR-250's no-buffering rule still holds for large files. Signed URL stays the primary path.
2. **Per-attempt timeout.** Replace the single global race with a per-attempt timeout (~6 s) inside the same 20 s overall budget, so the backoff retries actually run and a fallback still has time.

### Preventive (stops the class of defect)
3. **New failure class `hang`.** A timeout with no status becomes "The file didn't respond — trying another way / use Download instead", never "busy". `describeEvidenceFailure` reports `class=hang` and per-attempt elapsed times.
4. **Reachability probe** on failure: one lightweight authenticated request to confirm whether the backend is reachable at all, so the diagnostics line states plainly "backend reachable, signing hung" vs "backend unreachable from this machine".
5. **Regression guards:** per-attempt timeout triggers retries; a hung sign falls back to download and renders; timeout classifies as `hang` not `server-busy`.
6. **Governance:** ADR-300 + POLICY §EVIDENCE-PREVIEW-TRANSPORT-FALLBACK (a preview must never fail while a working transport for the same object exists), DOCUMENTATION.md version-history entry.

## Risk and impact

- **Data:** none — read-only preview path; no schema, RLS or storage change.
- **Workflow/permissions:** unchanged; the fallback uses the same RLS-checked read Ashish already passes.
- **UI/UX:** same dialog; new honest message and a richer diagnostics line.
- **Performance:** fallback buffers only small files (size cap); large files keep streaming or offer Download.
- **Regression risk:** low, confined to `EvidencePreviewDialog.tsx` (review + safety) and `evidenceError.ts`.
- **Rollback:** revert the frontend commit; nothing to undo in the database.

## Verification

1. Ashish reopens the same evidence — it renders via fallback, or shows a `class=hang` diagnostics line naming reachability.
2. Simulated hung signing in tests → retry runs, fallback renders, message is not "busy".
3. Normal users see no behaviour change on the fast path.
