import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Regression guard for Auditor Dashboard + Bulk Review parity (POLICY §108d,
// v2.66.116). Auditors must retain global read/update access on the review
// tables and must be recognised as a global operational notification sender.
// A future migration must not silently narrow any of these.

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

function latestDefining(fn: string): string {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(MIG_DIR, files[i]), "utf8");
    if (new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fn}\\s*\\(`, "i").test(body)) return body;
  }
  throw new Error(`No migration defines ${fn}`);
}

describe("auditor notification guard — global operational sender", () => {
  const body = latestDefining("can_send_notification_to");

  it("treats auditor as a global operational sender (POLICY §108d)", () => {
    // The sender-side auditor branch must exist so auditors can notify any
    // reviewer/employee from Dashboard or Bulk Review actions.
    expect(body).toMatch(/has_role\(\s*sender\s*,\s*'auditor'::app_role\s*\)/);
  });
});

describe("auditor RLS parity on review tables", () => {
  // Sanity check: no migration authored today or later removes auditor-scoped
  // policies from the review surface. This is a text scan, not a live probe,
  // but catches accidental DROP POLICY regressions in review.
  const CUTOFF = "20260717174101";
  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql") && f >= CUTOFF)
    .sort();

  const forbidden: RegExp[] = [
    /DROP\s+POLICY[^;]*"Admins and auditors can view all submissions"/i,
    /DROP\s+POLICY[^;]*"Auditors can update submissions"/i,
    /DROP\s+POLICY[^;]*"Auditors can update KPI status"/i,
    /DROP\s+POLICY[^;]*"Auditors can view all sub-period submissions"/i,
  ];

  it.each(files)("%s does not drop auditor review policies", (file) => {
    const body = readFileSync(join(MIG_DIR, file), "utf8");
    for (const pat of forbidden) {
      expect(pat.test(body), `${file} drops an auditor review policy`).toBe(false);
    }
  });
});