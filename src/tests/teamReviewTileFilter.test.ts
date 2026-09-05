import { describe, it, expect } from 'vitest';
import { matchesTeamTile, type TileContext } from '@/lib/teamReviewTileFilter';

const STAGES = ['kra_set', 'self_review', 'manager_check', 'skip_level_check', 'approved'];

const base = (over: Partial<TileContext>): TileContext => ({
  kpiStatus: 'kra_set',
  stages: STAGES,
  isDirect: false,
  isIndirect: false,
  isFunctional: false,
  isFullAccess: false,
  ...over,
});

describe('ADR-360 — team tile predicate', () => {
  it('shows KRA Set for direct, skip-level, functional and full-access viewers', () => {
    expect(matchesTeamTile('pending_kra_set', base({ isDirect: true }))).toBe(true);
    expect(matchesTeamTile('pending_kra_set', base({ isIndirect: true }))).toBe(true);
    expect(matchesTeamTile('pending_kra_set', base({ isFunctional: true }))).toBe(true);
    expect(matchesTeamTile('pending_kra_set', base({ isFullAccess: true }))).toBe(true);
  });

  it('shows KRA Set for full access even when the workflow has no self_review stage', () => {
    expect(
      matchesTeamTile(
        'pending_kra_set',
        base({ isFullAccess: true, stages: ['kra_set', 'manager_check', 'approved'] }),
      ),
    ).toBe(true);
  });

  it('never shows KRA Set for a non-kra_set status or an unrelated viewer', () => {
    expect(matchesTeamTile('pending_kra_set', base({ kpiStatus: 'self_review', isDirect: true }))).toBe(false);
    expect(matchesTeamTile('pending_kra_set', base({}))).toBe(false);
  });

  it('keeps pending_direct stage-true', () => {
    expect(matchesTeamTile('pending_direct', base({ kpiStatus: 'self_review', isDirect: true }))).toBe(true);
    expect(
      matchesTeamTile(
        'pending_direct',
        base({ kpiStatus: 'self_review', isDirect: true, stages: ['kra_set', 'self_review', 'approved'] }),
      ),
    ).toBe(false);
  });

  it('keeps pending_skip stage-true', () => {
    expect(
      matchesTeamTile('pending_skip', base({ kpiStatus: 'manager_check', isIndirect: true })),
    ).toBe(true);
    expect(
      matchesTeamTile(
        'pending_skip',
        base({ kpiStatus: 'manager_check', isIndirect: true, stages: ['kra_set', 'self_review', 'manager_check'] }),
      ),
    ).toBe(false);
  });

  it('keeps pending_functional stage-true', () => {
    expect(
      matchesTeamTile('pending_functional', base({ kpiStatus: 'self_review', isFunctional: true })),
    ).toBe(false);
  });
});
