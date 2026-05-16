/**
 * POLICY §128 — CI guard.
 *
 * Greps the source tree for every call to `isKpiLockedForPeriod(...)` and
 * asserts each call passes at least 4 comma-separated arguments (so the
 * per-KPI `frequency_cycle_start` slot is supplied). Two test files are
 * whitelisted because they intentionally exercise the default-fallback path.
 *
 * If this test fails, locate the offending file:line and add the KPI's
 * `frequency_cycle_start` as the 4th argument. Also confirm the SELECT
 * feeding that call site includes the `frequency_cycle_start` column.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join } from 'path';

const ROOT = join(process.cwd(), 'src');
const WHITELIST = new Set([
  'src/lib/frequencyUtils.test.ts',
  'src/test/reportFrequencyCycleOverride.test.ts',
  'src/test/frequencyLockCallSitesAudit.test.ts',
]);

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(name)) out.push(full);
  }
  return out;
}

/** Count comma-separated top-level args in the substring after `(` until matching `)`. */
function topLevelArgCount(src: string, openIdx: number): number {
  let depth = 1;
  let commas = 0;
  let i = openIdx + 1;
  let sawAny = false;
  while (i < src.length && depth > 0) {
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') depth++;
    else if (c === ')' || c === ']' || c === '}') depth--;
    else if (c === ',' && depth === 1) commas++;
    if (depth > 0 && !/\s/.test(c)) sawAny = true;
    i++;
  }
  return sawAny ? commas + 1 : 0;
}

describe('POLICY §128 — isKpiLockedForPeriod call-site audit', () => {
  it('every production call passes >=4 arguments (frequency_cycle_start required)', () => {
    const files = walk(ROOT);
    const violations: string[] = [];
    const re = /isKpiLockedForPeriod\s*\(/g;

    for (const f of files) {
      const rel = f.replace(process.cwd() + '/', '');
      if (WHITELIST.has(rel)) continue;
      const src = readFileSync(f, 'utf8');
      let m: RegExpExecArray | null;
      while ((m = re.exec(src)) !== null) {
        const openIdx = m.index + m[0].length - 1;
        const argc = topLevelArgCount(src, openIdx);
        if (argc < 4) {
          // Find line number for nice error
          const line = src.slice(0, m.index).split('\n').length;
          violations.push(`${rel}:${line} — only ${argc} arg(s)`);
        }
      }
    }

    expect(
      violations,
      `\nPOLICY §128 violation: pass per-KPI frequency_cycle_start as the 4th arg.\n${violations.join('\n')}\n`
    ).toEqual([]);
  });
});
