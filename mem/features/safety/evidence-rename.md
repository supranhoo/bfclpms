---
name: Safety Evidence Auto-Naming
description: Standardized auto-generated evidence display names {Stage}_{EmpCode}_v{n}; storage path + original_file_name immutable
type: feature
---

- Display name is auto-generated at upload time: `{StageLabel}_{EmployeeCode}_v{n}` (e.g. `RCA_101966_v1`). Stage labels: report→`Reported`, assignment→`Assignment`, investigation→`Investigation`, rca→`RCA`, capa→`CAPA`, verification→`Verification`. Source of truth: `src/lib/safetyEvidenceNaming.ts`.
- Sequence is scoped per (incident_id, stage, uploaded_by). Highest existing `_v{n}` for matching prefix wins → next is `n+1`. Non-conforming legacy rows are ignored by the counter.
- `original_file_name` is set on first insert and is immutable thereafter. `file_path` in storage is sanitized from the ORIGINAL filename for technical traceability.
- Display names are immutable: later workflow stage changes never rename earlier evidence. Manual rename UI was removed; the `rename_incident_evidence` RPC remains in the DB but is no longer invoked by the client.
- If a user has no `profile.employee_code`, the system falls back to an 8-char uppercased slice of their UUID so the convention stays parseable.
- Both upload paths use the helper: `useUploadEvidence` (incident detail) and `submitSafetyIncident` (initial report + offline queue). Callers must pass `reporterEmployeeCode` from `AuthContext.profile`.