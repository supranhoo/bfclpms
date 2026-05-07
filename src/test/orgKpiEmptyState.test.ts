import { describe, it, expect } from 'vitest';
import { deriveOrgKpiEmptyState } from '@/lib/orgKpiEmptyState';

const base = {
  isLoading: false,
  totalOrgKpis: 0,
  ownershipFilteredCount: 0,
  frequencyFilteredCount: 0,
  groupedCount: 0,
  isMaskedAdmin: false,
  hasActiveFilters: false,
};

describe('deriveOrgKpiEmptyState', () => {
  it('returns loading while data resolves', () => {
    expect(deriveOrgKpiEmptyState({ ...base, isLoading: true })).toBe('loading');
  });

  it('returns ok when groupedCount > 0', () => {
    expect(deriveOrgKpiEmptyState({ ...base, totalOrgKpis: 10, groupedCount: 3 })).toBe('ok');
  });

  it('flags backend with zero rows', () => {
    expect(deriveOrgKpiEmptyState({ ...base })).toBe('no-backend-rows');
  });

  it('flags masked admin with no owned KPIs', () => {
    expect(deriveOrgKpiEmptyState({
      ...base, totalOrgKpis: 100, isMaskedAdmin: true,
    })).toBe('masked-admin');
  });

  it('flags all-frequency-locked when ownership has rows but frequency filter empties them', () => {
    expect(deriveOrgKpiEmptyState({
      ...base, totalOrgKpis: 10, ownershipFilteredCount: 10, frequencyFilteredCount: 0,
    })).toBe('all-frequency-locked');
  });

  it('flags filtered-out when active filters hide everything', () => {
    expect(deriveOrgKpiEmptyState({
      ...base, totalOrgKpis: 10, ownershipFilteredCount: 10,
      frequencyFilteredCount: 8, hasActiveFilters: true,
    })).toBe('filtered-out');
  });

  it('Vivek April scenario: 170 backend defs, admin, no filters → ok when grouped > 0', () => {
    expect(deriveOrgKpiEmptyState({
      ...base, totalOrgKpis: 170, ownershipFilteredCount: 170,
      frequencyFilteredCount: 168, groupedCount: 168,
    })).toBe('ok');
  });
});