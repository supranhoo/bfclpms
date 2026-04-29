---
name: Safety Roadmap Phases 2-7
description: Pointer to docs/safety-roadmap-phase2-7.md — source-of-truth for Permit to Work, Training, Assets, Audits, Emergency, Analytics. Contains Status Tracker updated as each sub-phase progresses.
type: reference
---
Full roadmap lives in `docs/safety-roadmap-phase2-7.md`. Always read that
file before starting any new Safety phase work, and update its Status
Tracker table when a sub-phase moves todo → in_progress → done.

Phases 0, 1, and A1 (image compression) are done. Recommended next:
Phase 2 (Permit to Work) — self-contained, unlocks the Phase 4 asset link.

Universal rules (shell isolation, ['safety',*] cache prefix, RPC-only
status writes, RLS via has_safety_role, ConfirmDestructiveDialog,
REPLICA IDENTITY FULL for realtime, no hardcoded business vars) apply
to every phase — see the doc.
