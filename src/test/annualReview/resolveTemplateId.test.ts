import { describe, it, expect } from 'vitest';
import { resolveTemplateId } from '@/services/annualReview/annualReviewService';

describe('resolveTemplateId', () => {
  const seeded = 'tpl-seed';
  const override = 'tpl-override';

  it('returns null when instance is null/undefined', () => {
    expect(resolveTemplateId(null)).toBeNull();
    expect(resolveTemplateId(undefined)).toBeNull();
  });

  it('returns seeded template_id when no override', () => {
    expect(resolveTemplateId({ template_id: seeded, template_override_id: null })).toBe(seeded);
    expect(resolveTemplateId({ template_id: seeded } as never)).toBe(seeded);
  });

  it('returns override when set (override > seeded)', () => {
    expect(resolveTemplateId({ template_id: seeded, template_override_id: override })).toBe(override);
  });

  it('treats explicit null override as no-override', () => {
    expect(resolveTemplateId({ template_id: seeded, template_override_id: null })).toBe(seeded);
  });

  it('returns null if neither id is present', () => {
    expect(resolveTemplateId({ template_id: undefined as unknown as string, template_override_id: null })).toBeNull();
  });
});