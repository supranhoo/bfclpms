import { describe, it, expect } from 'vitest';

/**
 * BUG-`sajid-team-tiles-zero` (2026-06-22):
 * Non-full-access managers (e.g. Sajid Raza) get their team roster from the
 * server-side `get_manager_team_roster` RPC, which already tags each row's
 * `relationship` ('direct' | 'indirect'). The tile counter and tile filter
 * MUST derive direct/skip-level membership from that tag — falling back to
 * the legacy `useTeamMembers` / `useSkipLevelTeamMembers` pair only when the
 * RPC has no rows. Otherwise the Direct Pending and Skip-Level Pending tiles
 * render 0 even when each employee card shows a live pending badge.
 */

type Member = { id: string; relationship?: 'direct' | 'indirect' };

function resolveIdSets(
  managerRoster: Member[] | undefined,
  teamMembers: Member[] | undefined,
  skipLevelMembers: Member[] | undefined,
): { directIdSet: Set<string>; skipIdSet: Set<string> } {
  if (managerRoster && managerRoster.length > 0) {
    const direct = new Set<string>();
    const skip = new Set<string>();
    managerRoster.forEach((m) => {
      if (m.relationship === 'direct') direct.add(m.id);
      else if (m.relationship === 'indirect') skip.add(m.id);
    });
    return { directIdSet: direct, skipIdSet: skip };
  }
  return {
    directIdSet: new Set(teamMembers?.map((m) => m.id) || []),
    skipIdSet: new Set(skipLevelMembers?.map((m) => m.id) || []),
  };
}

describe('manager-roster relationship resolution', () => {
  it('uses managerRoster relationship tags when present (Sajid scenario)', () => {
    const roster: Member[] = [
      { id: 'd1', relationship: 'direct' },
      { id: 'd2', relationship: 'direct' },
      { id: 's1', relationship: 'indirect' },
    ];
    // Legacy hooks intentionally empty — must NOT zero-out the tiles.
    const { directIdSet, skipIdSet } = resolveIdSets(roster, [], []);
    expect([...directIdSet].sort()).toEqual(['d1', 'd2']);
    expect([...skipIdSet]).toEqual(['s1']);
  });

  it('falls back to legacy hooks when managerRoster is undefined or empty', () => {
    const { directIdSet, skipIdSet } = resolveIdSets(
      undefined,
      [{ id: 'a' }],
      [{ id: 'b' }],
    );
    expect([...directIdSet]).toEqual(['a']);
    expect([...skipIdSet]).toEqual(['b']);
  });

  it('ignores roster rows without a relationship tag', () => {
    const { directIdSet, skipIdSet } = resolveIdSets(
      [{ id: 'x' }, { id: 'd', relationship: 'direct' }],
      [],
      [],
    );
    expect([...directIdSet]).toEqual(['d']);
    expect(skipIdSet.size).toBe(0);
  });
});