---
name: Safety Evidence Rename
description: Uploader-only display-name rename on safety_incident_evidence; storage path is immutable; original_file_name preserved for audit
type: feature
---

- Column `safety_incident_evidence.original_file_name` is set once (first upload or first rename) and never changes after.
- RPC `rename_incident_evidence(evidence_id, new_file_name)` (SECURITY DEFINER) — only the original `uploaded_by` may rename. Rejects empty / >200 chars / slashes / control chars. Writes `incident.evidence_renamed` to `safety_audit_log` with previous, new, and original name.
- Storage `file_path` is NEVER modified — only the display `file_name`. Downloads use an `<a download>` with the current display name so the saved file matches what the user sees.
- UI: pencil icon shows only to the uploader; tooltip on a renamed row exposes the original filename.