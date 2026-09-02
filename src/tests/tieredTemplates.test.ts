/** ADR-339 — saved tiered option templates. */
import { describe, it, expect } from 'vitest';
import {
  normaliseTemplateName,
  findTemplateByName,
  validateTemplateInput,
  type TieredTemplate,
} from '@/services/kpi/tieredTemplateService';
import { TIERED_TEMPLATES } from '@/lib/qualitativeUom';

const options = [
  { label: '≥ 15% Incentive', rating: 5, definition: 'Based on Production Incentive' },
  { label: '10% – 14.99% Incentive', rating: 4, definition: 'Based on Production Incentive' },
  { label: '5% – 9.99% Incentive', rating: 3, definition: 'Based on Production Incentive' },
];

const saved: TieredTemplate[] = [
  { id: 't1', name: 'Production Incentive tiers', description: null, options },
];

describe('tiered template library', () => {
  it('round-trips builder options through a saved template', () => {
    const applied = saved[0].options.map((o) => ({ ...o }));
    expect(applied).toEqual(options);
  });

  it('resolves a duplicate name to the same row (overwrite, not a second row)', () => {
    expect(findTemplateByName(saved, '  production   incentive TIERS ')?.id).toBe('t1');
    expect(normaliseTemplateName('A  B')).toBe('a b');
  });

  it('rejects invalid input before saving', () => {
    expect(validateTemplateInput('', options)).toBe('Template name is required');
    expect(validateTemplateInput('X', options.slice(0, 1))).toBeTruthy();
    expect(validateTemplateInput('X', [{ label: '', rating: 3, definition: 'd' }, ...options])).toBeTruthy();
    expect(validateTemplateInput('X', options)).toBeNull();
  });

  it('keeps built-in presets intact', () => {
    expect(TIERED_TEMPLATES['achievement']).toHaveLength(3);
    expect(TIERED_TEMPLATES['achievement'][0].rating).toBe(5);
  });
});
