# Gap Checklist — Production Safety vs Target

Classification per governance standard:
**Keep** (preserve as-is) · **Candidate** (additive enhancement) ·
**Conditional** (additive but high-risk, gated) · **Reject** (incompatible).

## Shell / Routing / Access

| Item | Status | Class | Phase |
|---|---|---|---|
| `SafetyLayout` + sidebar isolation | Present | Keep | — |
| `SafetyModuleRoute` gate | Present | Keep | — |
| Frozen `/safety/*` route tree | Present | Keep | — |
| Prototype shallow route tree | — | Reject | — |

## Incidents

| Item | Status | Class | Phase |
|---|---|---|---|
| List + filters + mobile cards | Present | Keep | — |
| New (offline-capable) | Present | Keep | — |
| Detail + timeline + stage panel | Present | Keep | — |
| Stage-aware inline guidance copy | Missing | Candidate | 3 |
| RCA/CAPA panel polish | Partial | Candidate | 3 |
| `client_submission_id` surfaced in header | Missing | Candidate | 3 |
| Day-grouped timeline | Missing | Candidate | 3 |

## Permits

| Item | Status | Class | Phase |
|---|---|---|---|
| List/new/detail | Present | Keep | — |
| HIRA / LOTO / approvals | Present | Keep | — |
| Loading skeletons | Partial | Candidate | 2 |
| Sticky action bar parity on New | Partial | Candidate | 2 |

## Assets

| Item | Status | Class | Phase |
|---|---|---|---|
| Asset register + calibration + evidence | Present | Keep | — |
| CSV import | Missing | Conditional | 6 |
| Skeleton + empty-state coverage | Partial | Candidate | 2 |

## Audits

| Item | Status | Class | Phase |
|---|---|---|---|
| Templates / runs / scoreboard / log | Present | Keep | — |
| Trend on scoreboard | Partial | Candidate | 7 |

## Drills / Emergency

| Item | Status | Class | Phase |
|---|---|---|---|
| Drills + findings + participants | Present | Keep | — |
| Emergency contacts | Present | Keep | — |
| Emergency overlay (flagged) | Missing | Conditional | 5 |
| Emergency CSV import | Missing | Conditional | 6 |

## Training

| Item | Status | Class | Phase |
|---|---|---|---|
| Assignments + attempts + admin | Present | Keep | — |
| Compliance trend | Missing | Candidate | 7 |
| Assignment CSV import | Missing | Conditional | 6 |

## Settings / Admin

| Item | Status | Class | Phase |
|---|---|---|---|
| Settings hub + users + audit log | Present | Keep | — |
| Hours-worked (already importable) | Present | Keep | — |
| Feature flags admin UI | Missing | Conditional | 5 |
| Generic import landing (`/safety/settings/import`) | Missing | Conditional | 6 |

## Analytics

| Item | Status | Class | Phase |
|---|---|---|---|
| Page wired to `safety-analytics` fn | Present | Keep | — |
| TRIR / LTIFR / severity cards | Missing | Candidate | 7 |
| Trend charts (incidents / permits / audits / training) | Missing | Candidate | 7 |
| Excel export | Missing | Candidate | 7 |

## Offline / Evidence

| Item | Status | Class | Phase |
|---|---|---|---|
| `safetyOfflineQueue` (IndexedDB) | Present | Keep | — |
| `client_submission_id` contract | Present | Keep | — |
| Queue inspector sheet (read-only) | Missing | Candidate | 4 |
| Per-file evidence retry + progress | Missing | Candidate | 4 |
| Conflict UX | Missing | Candidate | 4 |

## Hardening

| Item | Status | Class | Phase |
|---|---|---|---|
| RLS on all `safety_*` tables | To be re-verified | Keep | 1 |
| FSM guards on incidents/permits | Present | Keep | — |
| Edge function auth posture documented | Partial | Candidate | 1 |
| Backup coverage report | Missing | Candidate | 1 |
| Module isolation regression test | Present (extend) | Candidate | 1 |

## Summary

No rebuild required. Remaining work is **gap closure + hardening +
prototype-derived UX polish**, executed phase-by-phase with the approval
gates defined in `docs/safety-integration-governance.md`.