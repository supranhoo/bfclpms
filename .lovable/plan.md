
# Background image compression for evidence uploads

Two-stage rollout. **This plan covers Phase A only**, with Phase B sketched for the next turn so we can validate Phase A in production first.

## Decisions locked in
- Scope: Safety + PMS evidence uploads, gated by one global setting.
- Quality: visually lossless (client q≈0.82, server WebP q=85 in Phase B), with auto-bump to higher quality for Safety severity ≥ `high`.
- Settings UI: PMS Admin → System Settings (single source of truth).
- Rollout: stagger — Phase A this turn, Phase B (edge fn + sweep + schema) next turn.

---

## Phase A — Client-side pre-compression (this turn)

### What ships
1. New dep: `browser-image-compression` (~15 KB gzip, Web Worker, preserves orientation, handles HEIC).
2. New helper `src/lib/imageCompression.ts` — single wrapper used by both Safety and PMS, with policy + skip rules + savings logger. Pure function, fully unit-tested.
3. Two new system_settings rows (JSONB values, surfaced as flags):
   - `image_compression_enabled` → boolean, default `true`.
   - `image_compression_policy` → `{ maxSizeMB, maxWidthOrHeight, quality, severeQuality }`, default `{1.5, 2560, 0.82, 0.92}`.
4. Settings UI section in `src/pages/admin/SystemSettings.tsx`: "Evidence uploads" group — master switch + quality slider (60–95) + a one-line description of what gets compressed and what is skipped.
5. Hook `useImageCompressionSettings()` — small React Query hook reading the two keys with sensible defaults so any upload site can call `compressIfEnabled(file, { severityHint? })` without prop-drilling.
6. Wire compression into upload sites:
   - `src/lib/safetyIncidentSubmit.ts` — before `safety-media` upload (online + offline-flush paths).
   - `src/hooks/useSafetyIncidentDetail.ts` (`useUploadEvidence`) — stage-specific uploads.
   - `src/components/ui/EvidenceUpload.tsx` — PMS evidence (covers SelfReviewSheet, EmployeeScorecard, UnifiedScorecard, QueryInbox, InlineQuickAction without per-site changes).
7. UI affordances:
   - "Optimizing…" chip on the in-progress file tile (already an upload progress slot — small additive change).
   - Post-upload sonner toast `Saved 2.4 MB · 78% smaller` only when savings ≥ 30% AND original ≥ 500 KB (avoids spamming for tiny gains).
8. Tests in `src/test/imageCompression.test.ts`:
   - skip non-image, skip < 300 KB, skip animated GIF, skip PNG with alpha (keep PNG).
   - HEIC → JPEG output mime.
   - failure path returns original file (never throws).
   - savings calculator threshold logic.

### Skip rules (locked into the wrapper)
| Condition | Action |
|---|---|
| `image_compression_enabled = false` | return original |
| not `image/*` | return original |
| `file.size < 300 KB` | return original |
| GIF (any) | return original (preserves animation) |
| PNG with alpha channel | re-encode as PNG, never JPEG |
| HEIC / HEIF | re-encode as JPEG q=0.9 |
| `severityHint` ∈ {high, critical} | use `severeQuality` (default 0.92) instead of `quality` |
| any compression error | log warning, return original |

### Files touched (Phase A)
- `package.json` — add `browser-image-compression`.
- new: `src/lib/imageCompression.ts`
- new: `src/hooks/useImageCompressionSettings.ts`
- new: `src/test/imageCompression.test.ts`
- edit: `src/lib/safetyIncidentSubmit.ts` (add compression step + pass `severity` from incident as `severityHint`)
- edit: `src/hooks/useSafetyIncidentDetail.ts` (compress before storage upload)
- edit: `src/components/ui/EvidenceUpload.tsx` (compress before upload, savings toast)
- edit: `src/pages/admin/SystemSettings.tsx` (new "Evidence uploads" section)
- new memory: `mem/features/admin/image-compression.md`
- POLICY append (new §): "Evidence image compression policy"

### Risk & impact (Phase A)
| Area | Risk | Mitigation |
|---|---|---|
| Data | None — only `file.size` and `mime` shrink before upload; no schema change. | n/a |
| Workflow | None — same upload entry points; compression is transparent. | Unit-tested skip rules; failure path returns original. |
| UI | "Optimizing…" chip could flash for sub-second compressions and feel janky. | Show chip only when compression takes >250 ms (debounced). |
| Cost | Web Worker CPU spike on low-end devices. | Default `useWebWorker:true`; `maxWidthOrHeight` caps memory; library handles cleanup. |
| Regression | PMS upload sites silently breaking. | Wrapper is a pure no-op when setting is OFF; one global kill-switch. |
| Quality | "Lost detail" complaint from a Safety Officer. | Severity-aware quality bump for high/critical; original size logged in console for forensic comparison; Phase B will persist `original_size_bytes`. |

### Acceptance (Phase A)
- Upload a 6 MB iPhone photo to a Safety incident → arrives at storage as ≤1.5 MB JPEG, 2560 px on long edge, EXIF stripped, no UI block.
- Upload the same photo with the global setting OFF → arrives unchanged.
- Upload a 200 KB JPEG → skipped (no toast, no chip).
- Upload an animated GIF → arrives unchanged.
- Upload a 3 MB transparent PNG → re-encoded as PNG (alpha preserved), savings toast.
- All 21 existing Safety tests + new compression tests pass.

---

## Phase B — Server-side WebP re-encode (next turn — sketch only)

Listed here for context; **not built in this turn.**

```text
INSERT safety_incident_evidence
        │
        ▼
AFTER INSERT trigger (image mime only)
        │ pg_net.http_post (async, fire-and-forget)
        ▼
edge fn: compress-safety-evidence
        │ download → encode WebP q=85 (or lossless if severity high+)
        │ upload .webp sibling → UPDATE row → DELETE original
        ▼
hourly cron: compress-safety-evidence-sweep (retries pending > 1h)
```

Schema additions (one migration, deferred to Phase B):
```sql
ALTER TABLE safety_incident_evidence
  ADD COLUMN original_size_bytes bigint,
  ADD COLUMN compression_status text DEFAULT 'pending'
    CHECK (compression_status IN ('pending','done','failed','skipped')),
  ADD COLUMN compressed_at timestamptz;
```

PMS Phase B is **out of scope** — PMS evidence is stored as a single `evidence_url` string column on `kpis` / `review_submissions`, not in a dedicated rows table, so there is no insert event to trigger on without a wider refactor. Phase A already gives PMS the bulk of the savings; we'll revisit a server-side path for PMS only if storage growth justifies it.

---

## Out of scope (call-outs for both phases)
- Video compression (would need ffmpeg in a separate worker).
- PDF compression (legal-evidence risk, marginal gains).
- Thumbnail generation (separate feature).
- Backfill of historical evidence (one-shot job, deferred until Phase B is stable).
