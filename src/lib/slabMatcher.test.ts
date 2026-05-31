import { describe, it, expect } from 'vitest';
import { pickSlab, isSlabApplicable, slabSpecificity, isExactScopeDuplicate, type SlabLike } from './slabMatcher';

const base = { rating_from: 4.75, rating_to: 5, increment_percent: 12, sort_order: 0 };

describe('slabMatcher', () => {
  it('global slab matches anyone in band', () => {
    const s: SlabLike = { ...base };
    expect(pickSlab([s], { company_id: 'A' }, 4.9)).toBe(s);
  });

  it('out of band returns null', () => {
    expect(pickSlab([{ ...base }], {}, 4.0)).toBeNull();
  });

  it('specific slab beats global slab for matching employee', () => {
    const global = { ...base, id: 'g' };
    const specific = { ...base, id: 's', company_ids: ['A'], increment_percent: 14 };
    const picked = pickSlab([global, specific], { company_id: 'A' }, 4.8);
    expect(picked?.id).toBe('s');
  });

  it('specific slab excluded for non-matching employee, global still picked', () => {
    const global = { ...base, id: 'g' };
    const specific = { ...base, id: 's', company_ids: ['A'] };
    const picked = pickSlab([global, specific], { company_id: 'B' }, 4.8);
    expect(picked?.id).toBe('g');
  });

  it('employee missing the scoped dimension does not match specific slab', () => {
    const specific = { ...base, company_ids: ['A'] };
    expect(isSlabApplicable(specific, {})).toBe(false);
  });

  it('higher specificity wins over single-dim slab', () => {
    const oneDim = { ...base, id: '1', company_ids: ['A'] };
    const twoDim = { ...base, id: '2', company_ids: ['A'], level_ids: ['L1'] };
    const picked = pickSlab([oneDim, twoDim], { company_id: 'A', level_id: 'L1' }, 4.8);
    expect(picked?.id).toBe('2');
  });

  it('employee_category scoping matches trainees only', () => {
    const trainee = { ...base, id: 't', employee_category_ids: ['trainee'], increment_percent: 8 };
    const global = { ...base, id: 'g' };
    expect(pickSlab([global, trainee], { employee_category_id: 'trainee' }, 4.9)?.id).toBe('t');
    expect(pickSlab([global, trainee], { employee_category_id: 'confirmed' }, 4.9)?.id).toBe('g');
  });

  it('ties on specificity broken by lower sort_order', () => {
    const a = { ...base, id: 'a', company_ids: ['A'], sort_order: 5 };
    const b = { ...base, id: 'b', company_ids: ['A'], sort_order: 1 };
    const picked = pickSlab([a, b], { company_id: 'A' }, 4.8);
    expect(picked?.id).toBe('b');
  });

  it('specificity counts scoped arrays', () => {
    expect(slabSpecificity({ ...base })).toBe(0);
    expect(slabSpecificity({ ...base, company_ids: ['A'], level_ids: ['L'] })).toBe(2);
  });

  it('exact scope duplicate detection', () => {
    const a = { ...base, company_ids: ['A', 'B'] };
    const b = { ...base, company_ids: ['B', 'A'] };
    const c = { ...base, company_ids: ['A'] };
    expect(isExactScopeDuplicate(a, b)).toBe(true);
    expect(isExactScopeDuplicate(a, c)).toBe(false);
  });
});