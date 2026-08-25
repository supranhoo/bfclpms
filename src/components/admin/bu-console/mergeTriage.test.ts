import { describe, expect, it } from 'vitest';
import {
  buildMergeGroups,
  filterGroups,
  isSafePair,
  proposalIdsForKeys,
  suggestCanonical,
  summarizeGroups,
  type MergeProposalLike,
} from './mergeTriage';

const p = (o: Partial<MergeProposalLike> & { id: string }): MergeProposalLike => ({
  category_id: 'cat-1',
  canonical_kra_name: 'Achieve production target',
  canonical_kpi_name: 'Power generation from 45 MWh/WHRB',
  variant_kra_name: 'Achieve production target',
  variant_kpi_name: 'Power generation from 45 MWh/WHRB - Description: monthly output',
  match_type: 'fuzzy',
  similarity: 0.71,
  affected_kpi_count: 7,
  affected_employee_count: 7,
  ...o,
});

describe('isSafePair', () => {
  it('treats titles that collapse to the same cleaned text as safe', () => {
    expect(
      isSafePair(
        p({
          id: '1',
          variant_kpi_name: 'Power generation from 45 MWh/WHRB (incentive %)(Aug-Sep) Scoring : 20% = 5',
        }),
      ),
    ).toBe(true);
  });

  it('treats exact matches and very high similarity as safe', () => {
    expect(isSafePair(p({ id: '2', match_type: 'exact', variant_kpi_name: 'Totally other' }))).toBe(true);
    expect(isSafePair(p({ id: '3', similarity: 0.95, variant_kpi_name: 'Other metric name' }))).toBe(true);
  });

  it('keeps genuinely different names for manual judgement', () => {
    expect(
      isSafePair(p({ id: '4', similarity: 0.6, variant_kpi_name: 'Steam consumption per tonne' })),
    ).toBe(false);
  });
});

describe('buildMergeGroups', () => {
  it('groups pairs sharing a canonical KPI and classifies the group', () => {
    const groups = buildMergeGroups([
      p({ id: '1' }),
      p({ id: '2', variant_kpi_name: 'Power generation from 45 MWh/WHRB (incentive %)' }),
      p({
        id: '3',
        canonical_kpi_name: 'Steam consumption',
        variant_kpi_name: 'Coal consumption',
        similarity: 0.6,
      }),
    ]);
    expect(groups).toHaveLength(2);
    const whrb = groups.find((g) => g.canonical_kpi_name.includes('WHRB'))!;
    expect(whrb.variantCount).toBe(2);
    expect(whrb.triage).toBe('safe');
    expect(whrb.affectedEmployeeCount).toBe(14);
    const steam = groups.find((g) => g.canonical_kpi_name === 'Steam consumption')!;
    expect(steam.triage).toBe('judgement');
  });

  it('marks a mixed group as needing judgement and sorts safe groups first', () => {
    const groups = buildMergeGroups([
      p({ id: '1' }),
      p({ id: '2', variant_kpi_name: 'Different metric entirely', similarity: 0.58 }),
      p({ id: '3', canonical_kpi_name: 'Plant availability', variant_kpi_name: 'Plant availability', match_type: 'exact' }),
    ]);
    expect(groups[0].triage).toBe('safe');
    expect(groups.find((g) => g.canonical_kpi_name.includes('WHRB'))!.triage).toBe('judgement');
  });

  it('separates identical names in different categories', () => {
    const groups = buildMergeGroups([p({ id: '1' }), p({ id: '2', category_id: 'cat-2' })]);
    expect(groups).toHaveLength(2);
  });
});

describe('suggestCanonical', () => {
  it('prefers the shortest title', () => {
    expect(
      suggestCanonical([
        p({ id: '1', canonical_kpi_name: 'Power generation from 45 MWh/WHRB - Description: x', variant_kpi_name: 'Power generation from 45 MWh/WHRB' }),
      ]),
    ).toBe('Power generation from 45 MWh/WHRB');
  });
});

describe('filter, ids and summary', () => {
  const groups = buildMergeGroups([
    p({ id: '1' }),
    p({ id: '2', canonical_kpi_name: 'Steam consumption', variant_kpi_name: 'Coal consumption', similarity: 0.6 }),
  ]);

  it('filters by triage class', () => {
    expect(filterGroups(groups, 'safe')).toHaveLength(1);
    expect(filterGroups(groups, 'judgement')).toHaveLength(1);
    expect(filterGroups(groups, 'all')).toHaveLength(2);
  });

  it('flattens selected keys to proposal ids', () => {
    const safe = filterGroups(groups, 'safe')[0];
    expect(proposalIdsForKeys(groups, [safe.key])).toEqual(['1']);
    expect(proposalIdsForKeys(groups, [])).toEqual([]);
  });

  it('summarises the queue', () => {
    const s = summarizeGroups(groups);
    expect(s).toMatchObject({ groups: 2, safeGroups: 1, judgementGroups: 1, proposals: 2 });
  });
});
