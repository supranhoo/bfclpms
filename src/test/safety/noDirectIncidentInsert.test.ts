/**
 * Phase 19.1 — Regression lock.
 *
 * No non-test source file may insert directly into `safety_incidents`.
 * All writes must go through the SECURITY DEFINER RPC
 * `public.report_safety_incident(jsonb)` (see Phase 18). A direct
 * `.from('safety_incidents').insert(...)` from the browser hits the
 * `Authenticated users can report incidents` RLS policy whose
 * `WITH CHECK (reporter_id = auth.uid())` clause fails the moment the
 * caller's JWT is missing or expired — the exact failure mode reported
 * on mobile/PWA bundles.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === 'node_modules' || entry === 'test' || entry === '__tests__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry) && !/\.test\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('safety_incidents — no direct insert from frontend (Phase 19.1)', () => {
  it('only the SECURITY DEFINER RPC may insert into safety_incidents', () => {
    const offenders: string[] = [];
    for (const file of walk('src')) {
      const body = readFileSync(file, 'utf8');
      // .from('safety_incidents').insert(  OR  .from("safety_incidents").insert(
      if (/\.from\(\s*['"]safety_incidents['"]\s*\)\s*\.insert\s*\(/.test(body)) {
        offenders.push(file);
      }
    }
    expect(offenders).toEqual([]);
  });
});