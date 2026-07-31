import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DEFAULT_RATING_SLABS, type RatingSlab } from '@/lib/annualReview/ratingSlab';

const KEY = ['annual-review-rating-slabs'];

/**
 * ADR-212 — admin-configurable rating slab bands. Falls back to the seeded
 * defaults if the table is empty so the report never renders a blank column.
 */
export function useAnnualReviewRatingSlabs() {
  return useQuery<RatingSlab[]>({
    queryKey: KEY,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from('annual_review_rating_slabs')
        .select('id, rating_from, rating_to, increment_percent, sort_order, is_active')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      const rows = (data ?? []).map((r) => ({
        id: r.id,
        rating_from: Number(r.rating_from),
        rating_to: r.rating_to === null ? null : Number(r.rating_to),
        increment_percent: Number(r.increment_percent),
        sort_order: r.sort_order,
        is_active: r.is_active,
      })) as RatingSlab[];
      return rows.length > 0 ? rows : (DEFAULT_RATING_SLABS as RatingSlab[]);
    },
  });
}

export interface SaveSlabsInput {
  slabs: RatingSlab[];
}

/** Replace the full slab set atomically-ish (delete removed rows, upsert rest). */
export function useSaveAnnualReviewRatingSlabs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ slabs }: SaveSlabsInput) => {
      const { data: existing, error: exErr } = await supabase
        .from('annual_review_rating_slabs')
        .select('id');
      if (exErr) throw exErr;

      const keepIds = new Set(slabs.map((s) => s.id).filter(Boolean) as string[]);
      const toDelete = (existing ?? []).map((r) => r.id).filter((id) => !keepIds.has(id));
      if (toDelete.length > 0) {
        const { error } = await supabase
          .from('annual_review_rating_slabs')
          .delete()
          .in('id', toDelete);
        if (error) throw error;
      }

      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id ?? null;

      const payload = slabs.map((s, idx) => ({
        ...(s.id ? { id: s.id } : {}),
        rating_from: s.rating_from,
        rating_to: s.rating_to,
        increment_percent: s.increment_percent,
        sort_order: idx + 1,
        is_active: s.is_active !== false,
        created_by: uid,
      }));

      const { error } = await supabase
        .from('annual_review_rating_slabs')
        .upsert(payload, { onConflict: 'id' });
      if (error) throw error;
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: KEY }); },
  });
}