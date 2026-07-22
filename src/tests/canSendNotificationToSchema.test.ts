import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

// Regression guard for the "column d.head_id does not exist" incident.
// Root cause: a migration redefined public.can_send_notification_to using
// departments.head_id, but the real column is departments.head_user_id.
// The latest migration touching the function MUST use head_user_id and
// preserve the bidirectional authorization matrix.

const MIG_DIR = join(process.cwd(), "supabase", "migrations");

function latestMigrationDefining(fnName: string): { file: string; body: string } {
  const files = readdirSync(MIG_DIR).filter((f) => f.endsWith(".sql")).sort();
  for (let i = files.length - 1; i >= 0; i--) {
    const body = readFileSync(join(MIG_DIR, files[i]), "utf8");
    if (new RegExp(`CREATE\\s+OR\\s+REPLACE\\s+FUNCTION\\s+public\\.${fnName}\\s*\\(`, "i").test(body)) {
      return { file: files[i], body };
    }
  }
  throw new Error(`No migration defines ${fnName}`);
}

describe("can_send_notification_to — schema validity", () => {
  const { file, body } = latestMigrationDefining("can_send_notification_to");

  it("is defined by a post-repair migration", () => {
    // The repair landed at 20260717122200; any later redefinition must also be valid.
    expect(file >= "20260717122200").toBe(true);
  });

  it("does NOT reference the non-existent departments.head_id column", () => {
    // Match `d.head_id` or `departments.head_id` as a whole identifier.
    expect(body).not.toMatch(/\b(d|departments)\.head_id\b/);
  });

  it("uses the real head_user_id columns on departments and business_units", () => {
    expect(body).toMatch(/\b(d|departments)\.head_user_id\b/);
    expect(body).toMatch(/\b(bu|business_units)\.head_user_id\b/);
  });

  it("preserves the bidirectional authorization matrix", () => {
    // Sender-side and target-side hierarchy branches.
    expect(body).toMatch(/p\.id\s*=\s*target/);
    expect(body).toMatch(/p\.id\s*=\s*sender/);
    // KPI-reviewer authorization tables.
    expect(body).toMatch(/audit_kpi_assignments/);
    expect(body).toMatch(/audit_kpi_level_assignments/);
    // Annual-review reviewer slots on both sides.
    expect(body).toMatch(/annual_review_instances/);
    expect(body).toMatch(/dept_head_id/);
    expect(body).toMatch(/bu_head_id/);
  });

  it("is SECURITY DEFINER with a locked search_path", () => {
    expect(body).toMatch(/SECURITY DEFINER/i);
    expect(body).toMatch(/SET\s+search_path\s*(TO|=)\s*'?public'?/i);
  });
});

describe("migration guardrail — forbidden schema identifiers", () => {
  // Any migration authored on or after the repair date must not reintroduce
  // known-bad column references. Add new entries here as regressions are found.
  const FORBIDDEN: Array<{ pattern: RegExp; reason: string }> = [
    {
      pattern: /\b(d|departments)\.head_id\b/,
      reason: "departments has head_user_id, not head_id",
    },
  ];
  const CUTOFF = "20260717122200";

  const files = readdirSync(MIG_DIR)
    .filter((f) => f.endsWith(".sql") && f >= CUTOFF)
    .sort();

  it.each(files)("%s contains no forbidden identifiers", (file) => {
    const body = readFileSync(join(MIG_DIR, file), "utf8");
    for (const { pattern, reason } of FORBIDDEN) {
      expect(pattern.test(body), `${file}: ${reason}`).toBe(false);
    }
  });
});