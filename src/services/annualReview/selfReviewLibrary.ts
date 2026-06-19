/**
 * Self Review Field Library — data access + pure mappers.
 * Library entries are converted into the existing
 * `TemplateSections.self_review_fields[]` + `translations.hi[...]` shape so
 * the template runtime is unchanged.
 */
import { supabase } from '@/integrations/supabase/client';
import type {
  SelfReviewLibraryEntry, SelfReviewField, TemplateSections,
} from '@/types/annualReview';

const TABLE = 'annual_review_self_review_library';
const ITEMS = 'annual_review_self_review_bundle_items';

const uid = (p = 'f') => `${p}_${Math.random().toString(36).slice(2, 9)}`;

export interface ListLibraryParams {
  search?: string;
  category?: string;
  kind?: 'field' | 'bundle';
  includeInactive?: boolean;
  limit?: number;
}

export async function listLibrary(p: ListLibraryParams = {}): Promise<SelfReviewLibraryEntry[]> {
  let q = (supabase as any).from(TABLE).select('*').order('sort_order', { ascending: true }).limit(p.limit ?? 100);
  if (!p.includeInactive) q = q.eq('is_active', true);
  if (p.kind) q = q.eq('kind', p.kind);
  if (p.category) q = q.eq('category', p.category);
  if (p.search && p.search.trim()) {
    const term = `%${p.search.trim()}%`;
    q = q.or(`label_en.ilike.${term},label_hi.ilike.${term},key.ilike.${term}`);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as SelfReviewLibraryEntry[];
}

export async function getBundleFields(bundleId: string): Promise<SelfReviewLibraryEntry[]> {
  const { data, error } = await (supabase as any)
    .from(ITEMS)
    .select('position, field:annual_review_self_review_library!annual_review_self_review_bundle_items_field_id_fkey(*)')
    .eq('bundle_id', bundleId)
    .order('position', { ascending: true });
  if (error) throw error;
  return ((data ?? []) as any[]).map((r) => r.field).filter(Boolean);
}

export async function createEntry(
  input: Partial<SelfReviewLibraryEntry> & Pick<SelfReviewLibraryEntry, 'kind' | 'key' | 'label_en'>,
): Promise<SelfReviewLibraryEntry> {
  const { data, error } = await (supabase as any).from(TABLE).insert(input).select('*').single();
  if (error) throw error;
  return data as SelfReviewLibraryEntry;
}

export async function updateEntry(id: string, patch: Partial<SelfReviewLibraryEntry>): Promise<SelfReviewLibraryEntry> {
  const { data, error } = await (supabase as any).from(TABLE).update(patch).eq('id', id).select('*').single();
  if (error) throw error;
  return data as SelfReviewLibraryEntry;
}

export async function deactivateEntry(id: string): Promise<void> {
  const { error } = await (supabase as any).from(TABLE).update({ is_active: false }).eq('id', id);
  if (error) throw error;
}

export async function deleteEntry(id: string): Promise<void> {
  const { error } = await (supabase as any).from(TABLE).delete().eq('id', id);
  if (error) throw error;
}

export interface MapOptions {
  /** When true, include Hindi translation entries in the returned `translations.hi` map. */
  includeHindi: boolean;
  /** ID generator (overridable for tests). */
  makeId?: () => string;
}

export interface MappedField {
  field: SelfReviewField;
  translations: { hi?: Record<string, string> };
}

/** Convert a single library `field` row into a SelfReviewField + translations. */
export function mapEntryToTemplateField(entry: SelfReviewLibraryEntry, opts: MapOptions): MappedField {
  if (entry.kind !== 'field') throw new Error('mapEntryToTemplateField: entry must be of kind "field"');
  const id = (opts.makeId ?? uid)();
  const field: SelfReviewField = {
    id,
    label: entry.label_en,
    placeholder: entry.placeholder_en ?? '',
    required: !!entry.required,
  };
  const tr: { hi?: Record<string, string> } = {};
  if (opts.includeHindi && (entry.label_hi || entry.placeholder_hi)) {
    tr.hi = {};
    if (entry.label_hi) tr.hi[`field:${id}:label`] = entry.label_hi;
    if (entry.placeholder_hi) tr.hi[`field:${id}:placeholder`] = entry.placeholder_hi;
  }
  return { field, translations: tr };
}

/** Expand a bundle into ordered field + translation entries. */
export function mapBundleToTemplateFields(
  fields: SelfReviewLibraryEntry[], opts: MapOptions,
): { fields: SelfReviewField[]; translations: { hi?: Record<string, string> } } {
  const out: SelfReviewField[] = [];
  const tr: Record<string, string> = {};
  for (const f of fields) {
    const m = mapEntryToTemplateField(f, opts);
    out.push(m.field);
    Object.assign(tr, m.translations.hi ?? {});
  }
  return { fields: out, translations: opts.includeHindi && Object.keys(tr).length ? { hi: tr } : {} };
}

/**
 * Apply an ordered list of library entries to existing template sections.
 * Single fields and bundles can be mixed; bundles must be pre-expanded by the caller.
 */
export function applyEntriesToSections(
  sections: TemplateSections,
  fields: SelfReviewLibraryEntry[],
  opts: MapOptions,
): TemplateSections {
  const expanded = mapBundleToTemplateFields(fields, opts);
  const existing = sections.self_review_fields ?? [];
  const nextFields = [...existing, ...expanded.fields];
  const nextTr = { ...(sections.translations ?? {}) };
  if (expanded.translations.hi) {
    nextTr.hi = { ...(nextTr.hi ?? {}), ...expanded.translations.hi };
  }
  return { ...sections, self_review_fields: nextFields, translations: nextTr };
}