import { describe, it, expect } from 'vitest';
import {
  sanitizeFieldKey,
  isReservedFieldKey,
  customFieldDefSchema,
  validateCustomFieldValues,
  normalizeCustomFieldValues,
  type CustomFieldDef,
} from '@/lib/employeeMasterCustomFields';

function mockDef(overrides: Partial<CustomFieldDef> = {}): CustomFieldDef {
  return {
    id: 'd1',
    field_key: 'shirt_size',
    field_label: 'Shirt Size',
    field_type: 'text',
    is_mandatory: false,
    show_on_add_user: true,
    show_on_edit_user: true,
    show_in_employee_master: false,
    dropdown_options: null,
    placeholder: null,
    help_text: null,
    is_active: true,
    sort_order: 0,
    ...overrides,
  };
}

describe('sanitizeFieldKey', () => {
  it('lowercases, replaces non-alnum with underscores, trims edges', () => {
    expect(sanitizeFieldKey('  Shirt Size!! ')).toBe('shirt_size');
    expect(sanitizeFieldKey('Café — Notes')).toBe('cafe_notes');
    expect(sanitizeFieldKey('___multi___under___')).toBe('multi_under');
  });
  it('caps length at 40 chars', () => {
    const long = 'a'.repeat(80);
    expect(sanitizeFieldKey(long).length).toBeLessThanOrEqual(40);
  });
});

describe('isReservedFieldKey', () => {
  it('blocks built-in employee master keys', () => {
    expect(isReservedFieldKey('full_name')).toBe(true);
    expect(isReservedFieldKey('email')).toBe(true);
    expect(isReservedFieldKey('shirt_size')).toBe(false);
  });
});

describe('customFieldDefSchema', () => {
  const base = {
    field_label: 'Shirt Size',
    field_key: 'shirt_size',
    field_type: 'text' as const,
    is_mandatory: false,
    show_on_add_user: true,
    show_on_edit_user: true,
    show_in_employee_master: false,
    dropdown_options: null,
    placeholder: null,
    help_text: null,
    is_active: true,
    sort_order: 0,
  };
  it('accepts a valid text field', () => {
    expect(customFieldDefSchema.safeParse(base).success).toBe(true);
  });
  it('rejects reserved keys', () => {
    const r = customFieldDefSchema.safeParse({ ...base, field_key: 'full_name' });
    expect(r.success).toBe(false);
  });
  it('rejects invalid key format', () => {
    expect(customFieldDefSchema.safeParse({ ...base, field_key: '1bad' }).success).toBe(false);
    expect(customFieldDefSchema.safeParse({ ...base, field_key: 'Bad-Key' }).success).toBe(false);
  });
  it('requires at least one dropdown option for dropdown type', () => {
    const r = customFieldDefSchema.safeParse({
      ...base,
      field_type: 'dropdown',
      dropdown_options: [],
    });
    expect(r.success).toBe(false);
  });
  it('rejects duplicate dropdown option values', () => {
    const r = customFieldDefSchema.safeParse({
      ...base,
      field_type: 'dropdown',
      dropdown_options: [
        { value: 's', label: 'Small' },
        { value: 's', label: 'Same' },
      ],
    });
    expect(r.success).toBe(false);
  });
});

describe('validateCustomFieldValues', () => {
  it('passes when mandatory field has a value', () => {
    const defs = [mockDef({ is_mandatory: true })];
    expect(validateCustomFieldValues(defs, { shirt_size: 'M' }).ok).toBe(true);
  });
  it('fails when mandatory field is blank', () => {
    const defs = [mockDef({ is_mandatory: true })];
    const r = validateCustomFieldValues(defs, { shirt_size: '   ' });
    expect(r.ok).toBe(false);
    if (r.ok === false) expect(r.fieldKey).toBe('shirt_size');
  });
  it('enforces email format', () => {
    const defs = [mockDef({ field_type: 'email', field_key: 'alt_email' })];
    expect(validateCustomFieldValues(defs, { alt_email: 'nope' }).ok).toBe(false);
    expect(validateCustomFieldValues(defs, { alt_email: 'a@b.co' }).ok).toBe(true);
  });
  it('enforces numeric values', () => {
    const defs = [mockDef({ field_type: 'number', field_key: 'shoe' })];
    expect(validateCustomFieldValues(defs, { shoe: 'abc' }).ok).toBe(false);
    expect(validateCustomFieldValues(defs, { shoe: '10' }).ok).toBe(true);
  });
  it('restricts dropdown values to defined options', () => {
    const defs = [
      mockDef({
        field_type: 'dropdown',
        field_key: 'size',
        dropdown_options: [
          { value: 's', label: 'S' },
          { value: 'm', label: 'M' },
        ],
      }),
    ];
    expect(validateCustomFieldValues(defs, { size: 'xl' }).ok).toBe(false);
    expect(validateCustomFieldValues(defs, { size: 's' }).ok).toBe(true);
  });
  it('skips optional blanks', () => {
    const defs = [mockDef({ is_mandatory: false })];
    expect(validateCustomFieldValues(defs, {}).ok).toBe(true);
  });
});

describe('normalizeCustomFieldValues', () => {
  it('drops blanks and coerces numbers/booleans', () => {
    const defs = [
      mockDef({ field_key: 'note', field_type: 'text' }),
      mockDef({ field_key: 'shoe', field_type: 'number' }),
      mockDef({ field_key: 'opt_in', field_type: 'yes_no' }),
    ];
    const out = normalizeCustomFieldValues(defs, {
      note: '  hello  ',
      shoe: '42',
      opt_in: true,
    });
    expect(out).toEqual({ note: 'hello', shoe: 42, opt_in: true });
  });
});