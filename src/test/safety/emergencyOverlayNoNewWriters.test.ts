/**
 * Phase 5 + Phase 8 governance guard.
 * Asserts the emergency-overlay UX is strictly UI-only: no DB writes,
 * no RPCs, no storage uploads, no queue mutators, no notification calls.
 * Phase 8: overlay may import the READ hook `useEmergencyContacts`, but
 * MUST NOT import the upsert/delete mutation hooks.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHASE5_FILES = [
  'src/components/safety/EmergencyOverlay.tsx',
  'src/components/safety/EmergencyFab.tsx',
];

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: 'any supabase insert', re: /\.insert\s*\(/ },
  { name: 'any supabase update', re: /\.update\s*\(/ },
  { name: 'any supabase upsert', re: /\.upsert\s*\(/ },
  { name: 'any supabase delete', re: /\.delete\s*\(/ },
  { name: 'any supabase rpc', re: /\.rpc\s*\(/ },
  { name: 'any storage upload', re: /\.upload\s*\(/ },
  { name: 'enqueuePendingIncident', re: /\benqueuePendingIncident\s*\(/ },
  { name: 'transition_safety_incident', re: /transition_safety_incident/ },
  { name: 'fetch() call', re: /\bfetch\s*\(/ },
  { name: 'upsert contact hook', re: /\buseUpsertEmergencyContact\b/ },
  { name: 'delete contact hook', re: /\buseDeleteEmergencyContact\b/ },
];

describe('Phase 5 — emergency overlay contract guard', () => {
  for (const rel of PHASE5_FILES) {
    it(`${rel} introduces no writers, RPCs, or network calls`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        expect(re.test(src), `${rel} must not contain: ${name}`).toBe(false);
      }
    });
  }
});