import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Phase 3 guardrail (Safety Governance Standard):
 * The new v2 incident UI components MUST be UI-only. They must NOT mutate
 * incident state directly — all writes must continue to flow through
 * StageActionPanel + transition_safety_incident RPC.
 *
 * This test fails if any v2 file introduces a direct
 * `.from('safety_incidents').update(...)` or `.rpc('transition_safety_incident', ...)`
 * call.
 */
const V2_FILES = [
  'src/components/safety/IncidentStageHeader.tsx',
  'src/components/safety/IncidentRcaPanel.tsx',
  'src/lib/incidentTimelineGrouping.ts',
];

describe('Safety Phase 3 — UI-only invariant', () => {
  for (const rel of V2_FILES) {
    it(`${rel} must not mutate incident state`, () => {
      const src = readFileSync(resolve(process.cwd(), rel), 'utf8');
      expect(src).not.toMatch(/\.from\(\s*['"]safety_incidents['"]\s*\)\s*\.\s*update/);
      expect(src).not.toMatch(/\.from\(\s*['"]safety_incidents['"]\s*\)\s*\.\s*delete/);
      expect(src).not.toMatch(/\.rpc\(\s*['"]transition_safety_incident['"]/);
    });
  }
});