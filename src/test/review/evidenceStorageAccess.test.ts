import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { normalizeEvidenceError, EVIDENCE_ACCESS_DENIED_MESSAGE } from "@/lib/review/evidenceError";

// ADR-190 / POLICY §EVIDENCE-READ-KPI-PARTICIPATION.
// Reviewer/auditor evidence lives under the uploader's folder, so read access
// must follow KPI participation. This guard pins the additive policy and the
// non-removal of the pre-existing folder-owner policy.

const MIG_DIR = join(process.cwd(), "supabase", "migrations");
const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
const bodies = files.map((f) => readFileSync(join(MIG_DIR, f), "utf8"));

describe("review evidence storage access (ADR-190)", () => {
  const policy = bodies.filter((b) =>
    /CREATE POLICY "Review evidence readable by KPI participants"/i.test(b),
  );

  it("defines the KPI-participant SELECT policy", () => {
    expect(policy.length).toBeGreaterThan(0);
  });

  it("is scoped to review-evidence and SELECT only", () => {
    const body = policy[policy.length - 1];
    expect(body).toMatch(/FOR SELECT/i);
    expect(body).toMatch(/bucket_id = 'review-evidence'/);
    expect(body).toMatch(/TO authenticated/i);
    expect(body).not.toMatch(/FOR (INSERT|UPDATE|DELETE|ALL)/i);
  });

  it("authorises via the KPI id in path segment 2, not the uploader folder", () => {
    const body = policy[policy.length - 1];
    expect(body).toMatch(/k\.id::text = \(storage\.foldername\(objects\.name\)\)\[2\]/);
    expect(body).toMatch(/k\.employee_id = auth\.uid\(\)/);
    expect(body).toMatch(/audit_kpi_assignments/);
    expect(body).toMatch(/kpi_mention_access/);
  });

  it("never leaves the folder-owner read policy dropped without recreating it", () => {
    // Historical migrations legitimately DROP ... IF EXISTS then re-CREATE.
    // What must never happen is a migration that only drops it.
    for (let i = 0; i < bodies.length; i++) {
      const body = bodies[i];
      const drops = /DROP\s+POLICY[^;]*"Users can view authorized evidence"/i.test(body);
      if (!drops) continue;
      expect(
        /CREATE\s+POLICY\s*"Users can view authorized evidence"/i.test(body),
        `${files[i]} drops the folder-owner read policy without recreating it`,
      ).toBe(true);
    }
  });
});

describe("evidence error normalisation", () => {
  it("replaces empty storage errors with an actionable message", () => {
    expect(normalizeEvidenceError({})).toBe(EVIDENCE_ACCESS_DENIED_MESSAGE);
    expect(normalizeEvidenceError({ message: "" })).toBe(EVIDENCE_ACCESS_DENIED_MESSAGE);
    expect(normalizeEvidenceError(undefined)).toBe(EVIDENCE_ACCESS_DENIED_MESSAGE);
  });

  it("maps denial-shaped storage errors to the access message", () => {
    expect(normalizeEvidenceError({ message: "Object not found", statusCode: "404" })).toBe(
      EVIDENCE_ACCESS_DENIED_MESSAGE,
    );
    expect(
      normalizeEvidenceError({ message: "new row violates row-level security policy" }),
    ).toBe(EVIDENCE_ACCESS_DENIED_MESSAGE);
  });

  it("preserves genuine, informative messages", () => {
    expect(normalizeEvidenceError(new Error("Network request failed"))).toBe(
      "Network request failed",
    );
  });

  it("honours a caller-supplied fallback", () => {
    expect(normalizeEvidenceError({}, "Could not open file")).toBe("Could not open file");
  });
});
