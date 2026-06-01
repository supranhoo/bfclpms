/**
 * Employee Master Custom Fields — domain layer
 * --------------------------------------------
 * Admin-defined dynamic fields that augment the fixed Add New User form.
 * Definitions live in `public.employee_master_custom_fields`; per-employee
 * values live in `public.employee_master_custom_field_values.values` (jsonb,
 * keyed by `field_key`).
 */

import { z } from 'zod';
import { EMPLOYEE_MASTER_FIELDS } from '@/lib/employeeMasterFields';

export const CUSTOM_FIELD_TYPES = [
  'text',
  'number',
  'date',
  'dropdown',
  'yes_no',
  'email',
  'phone',
  'long_text',
] as const;

export type CustomFieldType = (typeof CUSTOM_FIELD_TYPES)[number];

export const CUSTOM_FIELD_TYPE_LABELS: Record<CustomFieldType, string> = {
  text: 'Text',
  number: 'Number',
  date: 'Date',
  dropdown: 'Dropdown',
  yes_no: 'Yes / No',
  email: 'Email',
  phone: 'Phone',
  long_text: 'Long Text',
};

export interface DropdownOption {
  value: string;
  label: string;
}

export interface CustomFieldDef {
  id: string;
  field_key: string;
  field_label: string;
  field_type: CustomFieldType;
  is_mandatory: boolean;
  show_on_add_user: boolean;
  show_on_edit_user: boolean;
  show_in_employee_master: boolean;
  dropdown_options: DropdownOption[] | null;
  placeholder: string | null;
  help_text: string | null;
  is_active: boolean;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export type CustomFieldValues = Record<string, unknown>;

// Built-in keys cannot be reused for custom fields.
const RESERVED_KEYS = new Set<string>(EMPLOYEE_MASTER_FIELDS.map((f) => f.key));

/** Derive a safe, lowercase snake_case key from a free-text label. */
export function sanitizeFieldKey(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_{2,}/g, '_')
    .slice(0, 40);
}

export function isReservedFieldKey(key: string): boolean {
  return RESERVED_KEYS.has(key);
}

const FIELD_KEY_RE = /^[a-z][a-z0-9_]{1,40}$/;

const dropdownOptionSchema = z.object({
  value: z.string().trim().min(1, 'Option value is required').max(80),
  label: z.string().trim().min(1, 'Option label is required').max(120),
});

export const customFieldDefSchema = z
  .object({
    field_label: z.string().trim().min(1, 'Field label is required').max(80),
    field_key: z
      .string()
      .trim()
      .regex(FIELD_KEY_RE, 'Key must be lowercase, start with a letter, and contain only letters, numbers, or underscores')
      .refine((k) => !isReservedFieldKey(k), 'This key is reserved for a built-in field'),
    field_type: z.enum(CUSTOM_FIELD_TYPES),
    is_mandatory: z.boolean(),
    show_on_add_user: z.boolean(),
    show_on_edit_user: z.boolean(),
    show_in_employee_master: z.boolean(),
    dropdown_options: z.array(dropdownOptionSchema).optional().nullable(),
    placeholder: z.string().trim().max(120).optional().nullable(),
    help_text: z.string().trim().max(240).optional().nullable(),
    is_active: z.boolean(),
    sort_order: z.number().int().min(0).max(9999).default(0),
  })
  .superRefine((val, ctx) => {
    if (val.field_type === 'dropdown') {
      if (!val.dropdown_options || val.dropdown_options.length < 1) {
        ctx.addIssue({
          path: ['dropdown_options'],
          code: z.ZodIssueCode.custom,
          message: 'Dropdown fields need at least one option',
        });
      } else {
        const seen = new Set<string>();
        for (const o of val.dropdown_options) {
          if (seen.has(o.value)) {
            ctx.addIssue({
              path: ['dropdown_options'],
              code: z.ZodIssueCode.custom,
              message: 'Dropdown option values must be unique',
            });
            break;
          }
          seen.add(o.value);
        }
      }
    }
  });

export type CustomFieldDefInput = z.infer<typeof customFieldDefSchema>;

function isBlank(v: unknown): boolean {
  if (v === null || v === undefined) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (typeof v === 'boolean') return false;
  if (typeof v === 'number') return Number.isNaN(v);
  return false;
}

export type CustomFieldValidationResult =
  | { ok: true }
  | { ok: false; fieldKey: string; label: string; message: string };

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Validate user-entered values for the subset of definitions provided.
 * Caller is responsible for filtering to only the defs that should apply
 * (e.g. active + show_on_add_user).
 */
export function validateCustomFieldValues(
  defs: CustomFieldDef[],
  values: CustomFieldValues,
): CustomFieldValidationResult {
  for (const def of defs) {
    const raw = values[def.field_key];
    const blank = isBlank(raw);

    if (def.is_mandatory && blank) {
      return {
        ok: false,
        fieldKey: def.field_key,
        label: def.field_label,
        message: `${def.field_label} is mandatory.`,
      };
    }
    if (blank) continue;

    if (def.field_type === 'email') {
      if (typeof raw !== 'string' || !EMAIL_RE.test(raw.trim())) {
        return {
          ok: false,
          fieldKey: def.field_key,
          label: def.field_label,
          message: `${def.field_label} must be a valid email.`,
        };
      }
    }

    if (def.field_type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (!Number.isFinite(n)) {
        return {
          ok: false,
          fieldKey: def.field_key,
          label: def.field_label,
          message: `${def.field_label} must be a number.`,
        };
      }
    }

    if (def.field_type === 'dropdown') {
      const allowed = new Set((def.dropdown_options || []).map((o) => o.value));
      if (!allowed.has(String(raw))) {
        return {
          ok: false,
          fieldKey: def.field_key,
          label: def.field_label,
          message: `${def.field_label} has an invalid selection.`,
        };
      }
    }
  }
  return { ok: true };
}

/** Strip blanks and coerce numeric strings so the JSON we persist is clean. */
export function normalizeCustomFieldValues(
  defs: CustomFieldDef[],
  values: CustomFieldValues,
): CustomFieldValues {
  const out: CustomFieldValues = {};
  for (const def of defs) {
    const raw = values[def.field_key];
    if (isBlank(raw)) continue;
    if (def.field_type === 'number') {
      const n = typeof raw === 'number' ? raw : Number(String(raw).trim());
      if (Number.isFinite(n)) out[def.field_key] = n;
      continue;
    }
    if (def.field_type === 'yes_no') {
      out[def.field_key] = !!raw;
      continue;
    }
    if (typeof raw === 'string') {
      out[def.field_key] = raw.trim();
    } else {
      out[def.field_key] = raw;
    }
  }
  return out;
}