/**
 * v2.66.38 — Team Reviews manager roster gate.
 *
 * Non-full-access Manager Team Reviews must be driven by the server-side
 * `get_manager_team_roster` RPC (via useManagerTeamRoster). Org-wide profile,
 * stage, direct, and skip-level client queries are auxiliary and must not
 * blank the dashboard when the authoritative RPC roster succeeds.
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

describe('Team Reviews manager roster query gate (v2.66.38)', () => {
  it('makes all-profiles and stage-filter queries opt-in', () => {
    const src = orgSrc();

    expect(src).toMatch(/export function useProfiles\(options\?: \{ enabled\?: boolean \}\)/);
    expect(src).toMatch(/enabled:\s*isReady\s*&&\s*!!user\?\.id\s*&&\s*options\?\.enabled\s*!==\s*false/);
    expect(src).toMatch(/export function useProfilesByWorkflowStage\([\s\S]*options\?: \{ enabled\?: boolean \}/);
    expect(src).toMatch(/enabled:\s*isReady\s*&&\s*!!user\?\.id\s*&&\s*!!stage\s*&&\s*options\?\.enabled\s*!==\s*false/);
  });

  it('exposes a SECURITY DEFINER manager roster hook backed by get_manager_team_roster', () => {
    const src = orgSrc();
    expect(src).toMatch(/export function useManagerTeamRoster\(viewerId: string \| undefined\)/);
    expect(src).toMatch(/rpc\('get_manager_team_roster'/);
    expect(src).toMatch(/queryKey: \['manager-team-roster', viewerId\]/);
    expect(src).toMatch(/enabled: isUuid\(viewerId\)/);
  });

  it('does not enable org-wide profile queries for plain manager Team Reviews', () => {
    const src = gridSrc();

    expect(src).toMatch(/const profilesEnabled\s*=\s*isFullAccess\s*\|\|\s*isExploreMode\s*\|\|\s*!!autoOpenKpiId/);
    expect(src).toMatch(/useProfiles\(\{ enabled: profilesEnabled \}\)/);
    expect(src).toMatch(/const stageFilteredEnabled\s*=\s*!!requiredStage\s*&&\s*!isExploreMode/);
    expect(src).toMatch(/useProfilesByWorkflowStage\([\s\S]*\{ enabled: stageFilteredEnabled \}\)/);
  });

  it('scopes fatal roster errors to the server-side manager roster RPC for manager Team Reviews', () => {
    const src = gridSrc();

    expect(src).toMatch(/useManagerTeamRoster\(managerRosterEnabled \? viewerId : undefined\)/);
    expect(src).toMatch(/const rosterDataError\s*=\s*viewLevel === 'team' && !isFullAccess\s*\?\s*!!managerRosterError\s*:\s*!!profilesError \|\| !!teamError \|\| !!skipError \|\| !!stageFilteredError/);
    expect(src).toMatch(/dataLoadError=\{\s*rosterDataError\s*\}/);
    expect(src).toMatch(/if \(rosterDataError\) \{/);
  });
});