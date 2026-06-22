/**
 * v2.66.11.19 — Team Reviews manager roster gate.
 *
 * Non-full-access Manager Team Reviews must be driven by direct + skip-level
 * roster hooks only. Org-wide profile/stage queries are auxiliary and must not
 * blank a manager roster when those direct roster hooks succeed.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const gridSrc = () => readFileSync(
  join(process.cwd(), 'src/components/review/EmployeeSelectorGrid.tsx'),
  'utf8',
);

const orgSrc = () => readFileSync(
  join(process.cwd(), 'src/hooks/useOrganization.ts'),
  'utf8',
);

describe('Team Reviews manager roster query gate (v2.66.11.19)', () => {
  it('makes all-profiles and stage-filter queries opt-in', () => {
    const src = orgSrc();

    expect(src).toMatch(/export function useProfiles\(options\?: \{ enabled\?: boolean \}\)/);
    expect(src).toMatch(/enabled:\s*isReady\s*&&\s*!!user\?\.id\s*&&\s*options\?\.enabled\s*!==\s*false/);
    expect(src).toMatch(/export function useProfilesByWorkflowStage\([\s\S]*options\?: \{ enabled\?: boolean \}/);
    expect(src).toMatch(/enabled:\s*isReady\s*&&\s*!!user\?\.id\s*&&\s*!!stage\s*&&\s*options\?\.enabled\s*!==\s*false/);
  });

  it('does not enable org-wide profile queries for plain manager Team Reviews', () => {
    const src = gridSrc();

    expect(src).toMatch(/const profilesEnabled\s*=\s*isFullAccess\s*\|\|\s*isExploreMode\s*\|\|\s*!!autoOpenKpiId/);
    expect(src).toMatch(/useProfiles\(\{ enabled: profilesEnabled \}\)/);
    expect(src).toMatch(/const stageFilteredEnabled\s*=\s*!!requiredStage\s*&&\s*!isExploreMode/);
    expect(src).toMatch(/useProfilesByWorkflowStage\([\s\S]*\{ enabled: stageFilteredEnabled \}\)/);
  });

  it('scopes fatal roster errors to direct and skip hooks for manager Team Reviews', () => {
    const src = gridSrc();

    expect(src).toMatch(/const rosterDataError\s*=\s*viewLevel === 'team' && !isFullAccess\s*\?\s*!!teamError \|\| !!skipError\s*:\s*!!profilesError \|\| !!teamError \|\| !!skipError \|\| !!stageFilteredError/);
    expect(src).toMatch(/dataLoadError=\{\s*rosterDataError\s*\}/);
    expect(src).toMatch(/if \(rosterDataError\) \{/);
  });
});