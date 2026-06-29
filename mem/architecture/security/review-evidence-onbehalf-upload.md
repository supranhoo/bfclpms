---
name: review-evidence on-behalf upload policy
description: Admin and HR PMS may write to any employee folder in the review-evidence storage bucket; auditors stay read-only. Codifies ADR-096.
type: constraint
---
The `review-evidence` storage bucket MUST keep three permissive RLS policies
on `storage.objects` in addition to the per-user and Org-KPI policies:

- `Admins and HR PMS can upload evidence on behalf` (INSERT)
- `Admins and HR PMS can update evidence on behalf` (UPDATE)
- `Admins and HR PMS can delete evidence on behalf` (DELETE)

Each is gated by `bucket_id = 'review-evidence' AND
(public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))`.

Why: `EvidenceUpload.tsx` writes objects under `${employeeId}/${kpiId}/...`
so the existing `Users can view authorized evidence` SELECT policy continues
to grant the employee and their reporting chain read access. Without the
three on-behalf write policies, Admin Data Entry / HR-PMS proxy uploads fail
with "new row violates row-level security policy" (RCA 2026-06-29,
admin 101785 → Sajid Raza 100264).

Do NOT:
- Change `EvidenceUpload`'s path to use `auth.uid()` as the first folder —
  it would break the read policy for the employee.
- Extend write access to auditors — they are read-only by design.
- Drop or narrow these policies without an ADR superseding ADR-096.
