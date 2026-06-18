/**
 * Incentive Program Mappings — shared service layer.
 *
 * Why this exists:
 *  - `incentive_program_mappings` can hold thousands of rows per program
 *    (e.g. Metal Sizing currently has 2,560 employee mappings).
 *  - PostgREST silently caps unranged reads at 1,000 rows, which has
 *    historically truncated mapping reads and made some employees
 *    "invisible" downstream (Configuration → Data Entry parity bug).
 *  - Bulk writes against very large arrays risk request-size limits;
 *    we batch them.
 *
 * Every client read of `incentive_program_mappings` that returns a list
 * MUST go through `fetchProgramMappingsPaged`. Direct `.select(...)` is
 * forbidden — see POLICY (Incentive Mapping Paging).
 */
import { supabase } from '@/integrations/supabase/client';
import { fetchAllPaged } from '@/lib/fetchAll';

export interface ProgramMappingRow {
  id: string;
  program_id: string;
  mapping_type: 'division' | 'department' | 'business_unit' | 'designation' | 'pms_grade' | 'employee';
  mapping_value: string;
  created_at: string;
}

export const MAPPING_WRITE_BATCH_SIZE = 500;

/**
 * Returns ALL mapping rows for a program, walking past the 1,000-row
 * PostgREST cap via stable-ordered `.range(...)` pagination.
 */
export async function fetchProgramMappingsPaged(programId: string): Promise<ProgramMappingRow[]> {
  if (!programId) return [];
  return await fetchAllPaged<ProgramMappingRow>((from, to) =>
    supabase
      .from('incentive_program_mappings')
      .select('id, program_id, mapping_type, mapping_value, created_at')
      .eq('program_id', programId)
      .order('created_at', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
}

/**
 * Variant that returns ALL mapping rows across every program (used by
 * eligibility resolution for the "all programs" view). Paged.
 */
export async function fetchAllProgramMappingsPaged(): Promise<(ProgramMappingRow & { incentive_programs?: { name: string } | null })[]> {
  return await fetchAllPaged<any>((from, to) =>
    supabase
      .from('incentive_program_mappings')
      .select('id, program_id, mapping_type, mapping_value, created_at, incentive_programs(name)')
      .order('program_id', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );
}

function chunk<T>(arr: T[], size: number): T[][] {
  if (size <= 0) return [arr];
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Batched bulk insert. Existing unique constraint
 * `(program_id, mapping_type, mapping_value)` enforces deduplication —
 * callers should send only NEW rows. Returns total rows written.
 */
export async function bulkAddProgramMappingsBatched(
  rows: Array<Pick<ProgramMappingRow, 'program_id' | 'mapping_type' | 'mapping_value'>>,
  batchSize: number = MAPPING_WRITE_BATCH_SIZE,
): Promise<number> {
  if (!rows.length) return 0;
  let written = 0;
  for (const batch of chunk(rows, batchSize)) {
    const { error } = await supabase.from('incentive_program_mappings').insert(batch);
    if (error) throw error;
    written += batch.length;
  }
  return written;
}

/**
 * Batched bulk delete by row id.
 */
export async function bulkRemoveProgramMappingsBatched(
  ids: string[],
  batchSize: number = MAPPING_WRITE_BATCH_SIZE,
): Promise<number> {
  if (!ids.length) return 0;
  let removed = 0;
  for (const batch of chunk(ids, batchSize)) {
    const { error } = await supabase.from('incentive_program_mappings').delete().in('id', batch);
    if (error) throw error;
    removed += batch.length;
  }
  return removed;
}

/** Exported for unit tests. */
export const __internal = { chunk };