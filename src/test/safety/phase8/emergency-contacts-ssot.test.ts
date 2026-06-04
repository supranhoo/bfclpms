/**
 * Phase 8 SSOT — Emergency contacts source-of-truth.
 *
 * `useEmergencyContacts` must read the `safety_emergency_contacts` table only.
 * No JSONB fallback (e.g. from `safety_settings`) may be reintroduced.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const SRC = readFileSync('src/hooks/useSafetyEmergency.ts', 'utf8');

describe('Phase 8 — Emergency contacts SSOT', () => {
  it('reads from safety_emergency_contacts table', () => {
    expect(SRC).toMatch(/\.from\(\s*['"]safety_emergency_contacts['"]\s*\)/);
  });

  it('does not fall back to safety_settings or any JSONB blob for contacts', () => {
    // The hook file must not pull contacts out of safety_settings.
    const contactsBlock = SRC.slice(SRC.indexOf('useEmergencyContacts'));
    expect(contactsBlock).not.toMatch(/safety_settings/);
  });

  it('respects active-only and type filters server-side', () => {
    expect(SRC).toMatch(/\.eq\(\s*['"]is_active['"]\s*,\s*true\s*\)/);
    expect(SRC).toMatch(/\.eq\(\s*['"]contact_type['"]/);
  });
});
