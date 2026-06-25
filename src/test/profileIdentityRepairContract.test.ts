import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Contract test for the 2026-06-25 Profile Identity Integrity migrations.
 * Reads the on-disk migration files (the only source of truth available in
 * this offline test context) and asserts the four invariants documented in
 * POLICY.md and DOCUMENTATION.md (v2.66.61).
 */

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

function allMigrationSql(): string {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .map((f) => readFileSync(join(MIGRATIONS_DIR, f), "utf8"))
    .join("\n\n");
}

describe("Profile Identity Integrity — DB contract", () => {
  const sql = allMigrationSql();

  it("declares the identity-audit BEFORE UPDATE trigger on profiles", () => {
    expect(sql).toMatch(/CREATE TRIGGER\s+trg_profiles_identity_audit/i);
    expect(sql).toMatch(/BEFORE UPDATE ON public\.profiles/i);
  });

  it("declares the admin-only repair_profile_identity RPC", () => {
    expect(sql).toMatch(/FUNCTION public\.repair_profile_identity/);
    expect(sql).toMatch(/admin role required/);
  });

  it("declares the admin-only create_repair_profile RPC that always nulls email", () => {
    expect(sql).toMatch(/FUNCTION public\.create_repair_profile/);
    // create_repair_profile must always insert email = NULL, has_real_email = false
    expect(sql).toMatch(/create_repair_profile[\s\S]*?INSERT INTO public\.profiles[\s\S]*?NULL,\s*\n\s*false/);
  });

  it("declares the case-insensitive partial unique index on profiles.email", () => {
    expect(sql).toMatch(
      /CREATE UNIQUE INDEX[^;]*ux_profiles_email_ci[\s\S]*?lower\(email\)[\s\S]*?WHERE email IS NOT NULL/i,
    );
  });

  it("declares the admin-only list_profile_identity_drift function (replaces auth.users-exposing view)", () => {
    expect(sql).toMatch(/FUNCTION public\.list_profile_identity_drift/);
    // The earlier view that exposed auth.users must be dropped in a later migration.
    expect(sql).toMatch(/DROP VIEW IF EXISTS public\.v_profile_identity_drift/);
  });
});