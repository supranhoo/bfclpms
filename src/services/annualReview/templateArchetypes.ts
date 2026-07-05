import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';

export type ArchetypeRow = Database['public']['Tables']['annual_review_template_archetypes']['Row'];
export type ArchetypeInsert = Database['public']['Tables']['annual_review_template_archetypes']['Insert'];
export type ArchetypeUpdate = Database['public']['Tables']['annual_review_template_archetypes']['Update'];

export interface ArchetypeCriterion {
  key: string;
  label_en: string;
  label_hi?: string;
  max_score: number;
}

export const GRADE_BUCKETS = ['M', 'W', 'T', 'other'] as const;
export type GradeBucket = typeof GRADE_BUCKETS[number];

export const STAGE_KEYS = ['self', 'dept_head', 'bu_head'] as const;
export type StageKey = typeof STAGE_KEYS[number];

export function parseCriteria(raw: Json | null | undefined): ArchetypeCriterion[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((c) => {
      if (!c || typeof c !== 'object') return null;
      const o = c as Record<string, unknown>;
      const key = typeof o.key === 'string' ? o.key : '';
      const label_en = typeof o.label_en === 'string' ? o.label_en : '';
      if (!key || !label_en) return null;
      return {
        key,
        label_en,
        label_hi: typeof o.label_hi === 'string' ? o.label_hi : '',
        max_score: Number.isFinite(Number(o.max_score)) ? Number(o.max_score) : 5,
      } as ArchetypeCriterion;
    })
    .filter((c): c is ArchetypeCriterion => c !== null);
}

export function parseStringArray(raw: Json | null | undefined): string[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((v): v is string => typeof v === 'string');
}

export function parseStageWeights(raw: Json | null | undefined): Record<StageKey, number> {
  const fallback: Record<StageKey, number> = { self: 0, dept_head: 50, bu_head: 50 };
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fallback;
  const o = raw as Record<string, unknown>;
  return {
    self: Number.isFinite(Number(o.self)) ? Number(o.self) : 0,
    dept_head: Number.isFinite(Number(o.dept_head)) ? Number(o.dept_head) : 0,
    bu_head: Number.isFinite(Number(o.bu_head)) ? Number(o.bu_head) : 0,
  };
}

export async function listArchetypes(): Promise<ArchetypeRow[]> {
  const { data, error } = await supabase
    .from('annual_review_template_archetypes')
    .select('*')
    .order('sort_order')
    .order('code');
  if (error) throw error;
  return data ?? [];
}

export async function updateArchetype(id: string, patch: ArchetypeUpdate): Promise<ArchetypeRow> {
  const { data, error } = await supabase
    .from('annual_review_template_archetypes')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data;
}