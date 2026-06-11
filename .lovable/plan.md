
# Safety Parity Audit Plan

Read-only audit. No source code edits. One new artifact: `docs/safety/parity-audit-2026-06.md`.

## Goal

Trace every prototype artefact in `github.com/justVedantt/safety` to its real implementation in BFCL PMS, classify it (Fully Present / Partially Present / UI Only / Broken / Missing), back every verdict with file paths + evidence, and score parity.

## Method

### Phase A — Acquire prototype tree (read-only)

1. Fetch repo tree via `https://api.github.com/repos/justVedantt/safety/git/trees/HEAD?recursive=1` and save to `/tmp/proto-tree.json`.
2. Bulk-download relevant files via `https://raw.githubusercontent.com/justVedantt/safety/HEAD/<path>` into `/tmp/proto/` preserving structure. Limit to source-bearing dirs (`src/**`, `supabase/**`, `public/**`, `package.json`, root configs, docs).
3. Parse `package.json` + `supabase/config.toml` to enumerate dependencies, edge functions, storage buckets.

### Phase B — Build prototype inventory

For each prototype artefact, categorise into:
- Routes/pages (`src/pages/**`, route table)
- Components (`src/components/**`)
- Hooks (`src/hooks/**`)
- Services / utils / libs (`src/lib/**`, `src/services/**`)
- Contexts / providers
- Supabase migrations (`supabase/migrations/**`) → extracted tables, columns, RPCs, triggers, RLS policies, storage buckets, views
- Edge functions (`supabase/functions/**`)
- State machines / workflows (incident FSM, permit lifecycle, audit run, drill, training)
- Dashboard widgets / analytics MVs

Persist as `/tmp/proto-inventory.json`.

### Phase C — Build BFCL inventory

Use existing project tree. Scope:
- `src/pages/safety/**`, `src/components/safety/**`, `src/hooks/useSafety*`, `src/lib/safety*`, `src/contexts/SafetyOfflineSyncContext.tsx`
- `supabase/functions/{check-safety-sla,grant-safety-role,safety-analytics,safety-drill,permit-expiry-sweep,asset-calibration-sweep,training-overdue-sweep}`
- All `supabase/migrations/*safety*` plus any migration that creates/alters `safety_*` tables, MVs, RPCs, triggers, policies, buckets
- `docs/safety/**` for already-documented baselines

Persist as `/tmp/bfcl-safety-inventory.json`.

### Phase D — Match + classify

For every prototype artefact, locate the BFCL counterpart by **behaviour**, not filename:
- UI: match by route purpose + rendered fields/actions, not component name.
- Hooks/services: match by table touched + RPC called + mutation shape.
- DB: match table name + column set + RLS posture + RPC signature.
- Edge functions: match by trigger + auth posture + downstream RPC.

Verification depth per artefact:
1. UI trace — does the page render and do its CTAs invoke real hooks?
2. Hook trace — does the hook call a real RPC/table the BFCL DB exposes?
3. DB trace — does the table/RPC/policy exist in current migration history?
4. State transitions — do FSM guards still fire (incident `transition_safety_incident`, permit `*_permit` RPCs, audit/drill/training trigger blocks)?

Status rules:
- **Fully Present** — UI + hook + DB + FSM all aligned.
- **Partially Present** — behaviour exists but missing fields, missing RBAC, or narrower scope.
- **UI Only** — page/component rendered but no working write path (or RLS blocks).
- **Broken** — code exists and calls a missing RPC/column/bucket, or RLS denies all paths.
- **Missing** — no equivalent.

Spawn parallel `acp_subagent--explore` tasks per module to keep my own context lean:
1. Incidents + offline queue + idempotency
2. Permits + LOTO/HIRA + approvals
3. Audits + templates + responses + scoreboard
4. Drills + participants + findings
5. Training + SOPs + quizzes + attempts
6. Emergency contacts + drills + overlay/siren
7. Assets + calibration + evidence
8. Analytics MVs + dashboards + widgets
9. RBAC + module gate + settings + RLS matrix
10. Edge functions + cron + SLA

Each subagent returns a JSON-shaped findings block I merge into the report.

### Phase E — Database parity diff

Produce 6 tables in the report:
1. Tables (prototype vs BFCL, column-level deltas)
2. Views / MVs
3. RPCs (signature + SECURITY DEFINER posture)
4. Triggers (FSM guards, before-insert, status-write blocks)
5. Storage buckets + MIME/size policy
6. RLS policies (per-table count, anonymous exposure, write gates)

### Phase F — Score

- % Fully Present
- % Partially Present
- % UI Only
- % Broken
- % Missing

Weighted by artefact category (DB > workflow > hook > page > component), with raw counts also shown.

### Phase G — Write report

Single markdown file at `docs/safety/parity-audit-2026-06.md`:

```text
1. Executive summary + final score
2. Methodology + repo SHAs used
3. Feature parity table (prototype file → BFCL file → status → evidence → gap)
4. Missing files list
5. Broken implementations list
6. Database parity (6 sub-tables)
7. Workflow / state-machine parity
8. Edge functions parity
9. RBAC + RLS parity
10. Appendix: prototype inventory dump, BFCL safety inventory dump
```

## Deliverables

- `docs/safety/parity-audit-2026-06.md` — the only repo write.
- Intermediates (`/tmp/proto-tree.json`, `/tmp/proto-inventory.json`, `/tmp/bfcl-safety-inventory.json`) discarded.

## Non-goals

- No code edits. No migrations. No memory edits. No DB writes.
- No recommendations beyond the gap list (a follow-up plan can convert gaps to tickets if requested).

## Risks

- **Prototype repo is private** → fetch returns 404. Fallback: ask user for an upload.
- **GitHub rate limiting** on unauth raw downloads → batch with sleep + ETag if needed.
- **Behavioural matching is judgement-heavy** → every "Fully Present" verdict cites both the prototype evidence line and the BFCL evidence line, so the user can spot-check.
- **Subagent context drift** → each subagent gets the same status rubric verbatim.

## Acceptance

Report renders, every row has a file:line citation on both sides (or an explicit "n/a — missing"), and the score block sums to 100%.
