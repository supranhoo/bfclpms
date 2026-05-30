/**
 * Phase 4 governance guard.
 * Asserts the offline-inspector UX does NOT introduce any new path that
 * bypasses the existing queue / idempotency / upload contracts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const PHASE4_FILES = [
  'src/components/safety/OfflineQueueInspector.tsx',
];

const FORBIDDEN_PATTERNS: Array<{ name: string; re: RegExp }> = [
  { name: "direct safety_incident_evidence insert", re: /from\(['"]safety_incident_evidence['"]\)\s*\.insert/ },
  { name: "direct safety-media upload", re: /from\(['"]safety-media['"]\)\s*\.upload/ },
  { name: "client_submission_id assignment", re: /client_submission_id\s*[:=]/ },
  { name: "direct safety_incidents insert/update", re: /from\(['"]safety_incidents['"]\)\s*\.(insert|update|delete|upsert)/ },
  { name: "direct transition RPC", re: /\.rpc\(\s*['"]transition_safety_incident['"]/ },
  { name: "enqueuePendingIncident (new writer)", re: /\benqueuePendingIncident\s*\(/ },
  { name: "recordPendingFailure (sync-engine only)", re: /\brecordPendingFailure\s*\(/ },
];

describe('Phase 4 — offline inspector contract guard', () => {
  for (const rel of PHASE4_FILES) {
    it(`${rel} introduces no forbidden writers`, () => {
      const src = readFileSync(join(process.cwd(), rel), 'utf8');
      for (const { name, re } of FORBIDDEN_PATTERNS) {
        expect(re.test(src), `${rel} must not contain: ${name}`).toBe(false);
      }
    });
  }
});