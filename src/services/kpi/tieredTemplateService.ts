/**
 * ADR-339 — Saved tiered option templates.
 *
 * The ONLY module that touches `public.kpi_scoring_scales`.
 * POLICY §KPI-TIERED-TEMPLATE-LIBRARY: templates are org-wide, admin-managed,
 * soft-deleted, and never retro-apply to KPIs already saved.
 */
import { supabase } from '@/integrations/supabase/client';
import { QualitativeOption, validateQualitativeOptions } from '@/lib/qualitativeUom';

export interface TieredTemplate {
  id: string;
  name: string;
  description: string | null;
  options: QualitativeOption[];
}

const TABLE = 'kpi_scoring_scales';
const KIND = 'tiered';

/** Same normalisation used by the DB unique index (case/space insensitive). */
export function normaliseTemplateName(name: string): string {
  return (name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

export function validateTemplateInput(name: string, options: QualitativeOption[]): string | null {
  if (!name.trim()) return 'Template name is required';
  return validateQualitativeOptions(options);
}

export function findTemplateByName(
  templates: TieredTemplate[],
  name: string,
): TieredTemplate | undefined {
  const key = normaliseTemplateName(name);
  return templates.find((t) => normaliseTemplateName(t.name) === key);
}

export async function listTieredTemplates(): Promise<TieredTemplate[]> {
  const { data, error } = await supabase
    .from(TABLE as any)
    .select('id, name, description, qualitative_options')
    .eq('scale_kind', KIND)
    .eq('is_active', true);
  if (error) throw error;

  return ((data ?? []) as any[])
    .map((row) => ({
      id: row.id as string,
      name: (row.name ?? '') as string,
      description: (row.description ?? null) as string | null,
      options: (row.qualitative_options ?? []) as QualitativeOption[],
    }))
    .filter((t) => Array.isArray(t.options) && t.options.length >= 2)
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function saveTieredTemplate(input: {
  id?: string | null;
  name: string;
  description?: string | null;
  options: QualitativeOption[];
}): Promise<void> {
  const invalid = validateTemplateInput(input.name, input.options);
  if (invalid) throw new Error(invalid);

  const { data: userData } = await supabase.auth.getUser();
  const payload = {
    name: input.name.trim(),
    description: input.description?.trim() || null,
    qualitative_options: input.options as any,
    scale_kind: KIND,
    is_active: true,
    r0: null, r1: null, r2: null, r3: null, r4: null, r5: null,
    threshold_mode: null,
  };

  if (input.id) {
    const { error } = await supabase.from(TABLE as any).update(payload).eq('id', input.id);
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from(TABLE as any)
    .insert({ ...payload, created_by: userData?.user?.id ?? null } as any);
  if (error) throw error;
}

export async function deactivateTieredTemplate(id: string): Promise<void> {
  const { error } = await supabase.from(TABLE as any).update({ is_active: false }).eq('id', id);
  if (error) throw error;
}
