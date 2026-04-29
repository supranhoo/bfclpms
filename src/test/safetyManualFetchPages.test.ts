import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Policy guard (POLICY §113 / ADR-050): every page in MIGRATED_PAGES MUST
 * use the sanctioned manual-fetch primitives and MUST NOT auto-load list
 * data via auto-fetch hooks. Adding new offenders requires either updating
 * the policy or migrating the page.
 */

const MIGRATED_PAGES = [
  'SafetyAuditLog.tsx',
  'SafetyIncidents.tsx',
  'SafetyPermits.tsx',
  'SafetyAudits.tsx',
  'SafetyAssets.tsx',
  'SafetyHoursWorked.tsx',
  'SafetySlaMonitor.tsx',
];

function read(name: string) {
  return readFileSync(join(process.cwd(), 'src/pages/safety', name), 'utf8');
}

describe('Safety manual-fetch policy (POLICY §113)', () => {
  it.each(MIGRATED_PAGES)('%s uses useManualQuery + SafetyFilterBar + SafetyDataTable', (name) => {
    const src = read(name);
    expect(src).toMatch(/useManualQuery/);
    expect(src).toMatch(/SafetyFilterBar/);
    expect(src).toMatch(/SafetyDataTable/);
  });

  it.each(MIGRATED_PAGES)('%s does not auto-fetch lists with useQuery({ enabled: true })', (name) => {
    const src = read(name);
    // No bare useQuery({ ... select(...) ... }) calls without enabled:false
    // We approximate: the file should not import useQuery directly except via useManualQuery.
    // Allow `useQueryClient` (mutation invalidation) but not `useQuery` itself.
    const hasBareUseQueryImport = /from\s+'@tanstack\/react-query'[^;]*\buseQuery\b/.test(src)
      && !/useQueryClient/.test(src.match(/from\s+'@tanstack\/react-query'[^;]+/)?.[0] ?? '');
    // simpler: look for `import { useQuery` token sequence
    const importsUseQuery = /import\s*\{[^}]*\buseQuery\b[^}]*\}\s*from\s*'@tanstack\/react-query'/.test(src);
    expect(importsUseQuery).toBe(false);
  });
});
