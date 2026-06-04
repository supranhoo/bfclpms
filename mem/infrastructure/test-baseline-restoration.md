---
name: Test Baseline Restoration
description: Migration-scan guard tests must use latest-definition semantics; CREATE OR REPLACE preserves grants
type: preference
---
Migration-scan guard tests scan only the latest `CREATE OR REPLACE FUNCTION public.<target>` body — not all historical migrations. Migrations are immutable; the deployed contract is the most recent body. **Why:** scanning history produces false positives on legacy migrations that have been superseded. **How to apply:** filter migration files by the `CREATE OR REPLACE FUNCTION public.<target>` regex, sort ascending, take the last; run forbidden/required pattern checks against that body only. For GRANT EXECUTE assertions, accept the grant on any historical migration for the same signature because `CREATE OR REPLACE FUNCTION` preserves prior grants.

Also: when a Category-B contract test fails, treat it as a defect until ADR/DOCUMENTATION/POLICY/CHANGELOG proves the contract intentionally changed. If proven stale → update the test. Otherwise → surgical corrective migration that restores ONLY the missing clause, with before/after evidence in the changelog.