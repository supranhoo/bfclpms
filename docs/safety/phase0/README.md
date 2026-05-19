# Phase 0 — Read-Only Discovery

Per `docs/safety-integration-governance.md`, Phase 0 produces verification
artifacts only. No source files are modified.

Generated: 2026-05-19. Production-as-authoritative.

## Files

- `routes-diff.md` — `/safety/*` route tree (production-frozen).
- `schema-diff.md` — `public.safety_*` tables + enums.
- `rpc-diff.md` — Safety SECURITY DEFINER funcs and transition RPCs.
- `functions-diff.md` — Edge function inventory + auth posture.
- `cache-and-querykeys.md` — Safety React Query namespace map.
- `idempotency-and-offline.md` — `client_submission_id` + IndexedDB queue.
- `gap-checklist.md` — Per-feature gap list with phase mapping.

## Authority

Any deviation from these inventories in later phases requires explicit
human approval and an ADR; otherwise it counts as a Stop Condition per
the governance standard.