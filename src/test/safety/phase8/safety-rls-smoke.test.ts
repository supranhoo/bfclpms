/**
 * Phase 8 SSOT — RLS posture smoke (static).
 *
 * Walks the most recent migration that touches each core Safety table and
 * asserts ENABLE ROW LEVEL SECURITY is present. Read-only, no DB calls.
 * This guards against a future migration silently disabling RLS.
 */
import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const MIG_DIR = 'supabase/migrations';
const FILES = readdirSync(MIG_DIR).sort();
const ALL_SQL = FILES.map((f) => readFileSync(join(MIG_DIR, f), 'utf8')).join('\n');

const CORE_TABLES = [
  'safety_incidents',
  'safety_permits',
  'safety_assets',
  'safety_audit_runs',
  'safety_emergency_drills',
  'safety_emergency_contacts',
  'safety_settings',
  'safety_module_access',
] as const;

describe('Phase 8 — Safety RLS smoke (static migration scan)', () => {
  for (const t of CORE_TABLES) {
    it(`enables RLS on ${t} somewhere in migration history`, () => {
      const re = new RegExp(`ALTER\\s+TABLE\\s+(public\\.)?${t}\\s+ENABLE\\s+ROW\\s+LEVEL\\s+SECURITY`, 'i');
      expect(ALL_SQL).toMatch(re);
    });
  }

  it('never DISABLEs RLS on any safety_* table', () => {
    const bad = /ALTER\s+TABLE\s+(public\.)?safety_[a-z_]+\s+DISABLE\s+ROW\s+LEVEL\s+SECURITY/i;
    expect(ALL_SQL).not.toMatch(bad);
  });
});
