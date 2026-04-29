---
name: Server-side Image Compression (Phase B)
description: Background WebP re-encoder edge function, queue tables, cron schedule, and PMS rewrite safety flag
type: feature
---
# Phase B — Server-side WebP Re-encode

## Components
- **Edge fn**: `supabase/functions/compress-evidence/index.ts` — service-role, `verify_jwt=false`.
  - Decoders: `@jsquash/jpeg`, `@jsquash/png`. Encoder: `@jsquash/webp` (q=85).
  - Batch size: 8 per queue per run. Max attempts: 3.
  - Skips when WebP ≥ original (`no_savings`), then marks `skipped`.
- **Cron**: `compress-evidence-every-2min` (jobid 13) — `*/2 * * * *`.

## Schema
- `safety_incident_evidence` adds: `compression_status`, `original_size_bytes`, `compressed_at`, `compression_attempts`, `compression_error`, `original_file_path`. BEFORE INSERT trigger `enqueue_safety_compression_on_insert` marks image MIMEs as `pending`, others as `skipped`.
- `pms_evidence_compression_jobs` (queue): one row per JSONB url to re-encode. UNIQUE on (source_table, source_id, source_column, array_index, original_url) — idempotent. AFTER INSERT/UPDATE trigger `enqueue_pms_compression_jobs` walks the six `*_evidence_urls` columns on `review_submissions`.
- Helper `is_image_url(text)` matches `.jpg/.jpeg/.png/.webp/.heic/.heif` (case-insensitive, query-string tolerant).

## Settings (system_settings)
- `server_compression_enabled` (default `true`) — master kill switch.
- `server_compression_pms_rewrite` (default **`false`**) — when OFF, PMS jobs encode + upload `.webp` siblings but DO NOT rewrite the JSONB URL. Flip ON only after observing the queue stabilise. Safety always rewrites (dedicated table, not score-bound JSONB).

## File rewrite policy
- Safety: `file_path` → sibling `.webp`, `mime_type='image/webp'`, `size_bytes` updated. `original_file_path` retained for 7-day rollback.
- PMS: when rewrite ON, replaces `arr[array_index]` only if it still equals `original_url` (concurrency-safe). Original storage object kept.

## Admin UI
- `src/components/admin/ServerCompressionPanel.tsx` rendered inside System Settings → Upload tab. Shows master toggle, PMS-rewrite toggle (with amber warning), and live queue counts (auto-refresh 30s).
