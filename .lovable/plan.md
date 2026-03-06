

# Plan: Add Role Permission Matrix Detail Section to Governance Explainer

## What to Add

Insert a new detailed section (between "Permission Types" and "Auto-Lock Rules") explaining how the Role Permission Matrix works in practice. This will cover:

1. **What it is** — A grid where rows are roles and columns are permissions, with toggles to enable/disable each
2. **The 7 roles** — Admin, Manager, Employee, Auditor, Management, HR PMS, Skip Level — with a brief description of each role's typical responsibility
3. **How status is calculated** — "Full Access" vs "Restricted" logic: a role is restricted if any operational permission is OFF or if View Only is ON
4. **Admin exception** — Admin role toggles are always disabled; admins always have full access
5. **View Only special behavior** — When enabled, it overrides all other permissions for that role, making everything read-only
6. **Saving & enforcement** — Changes create role-level locks in the lock hierarchy; saved permissions are enforced via the `check_review_period_permission` RPC
7. **Example scenarios** — e.g., "Restrict employees to Self Review only during Manager Review stage", "Set Auditors to View Only"

## File Modified

- `src/pages/admin/GovernanceExplainer.tsx` — Add a new Card section with sub-sections using a role reference table, status logic explanation, and practical scenarios

## No other changes needed

Static content only — no database, routing, or component changes.

