CREATE TABLE public.annual_review_rating_slabs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rating_from numeric NOT NULL,
  rating_to numeric,
  increment_percent numeric NOT NULL DEFAULT 0,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.annual_review_rating_slabs TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.annual_review_rating_slabs TO authenticated;
GRANT ALL ON public.annual_review_rating_slabs TO service_role;

ALTER TABLE public.annual_review_rating_slabs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "rating_slabs_read"
  ON public.annual_review_rating_slabs FOR SELECT TO authenticated USING (true);

CREATE POLICY "rating_slabs_write"
  ON public.annual_review_rating_slabs FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE TRIGGER trg_ar_rating_slabs_updated_at
  BEFORE UPDATE ON public.annual_review_rating_slabs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

INSERT INTO public.annual_review_rating_slabs (rating_from, rating_to, increment_percent, sort_order) VALUES
  (0,   2,    0,  1),
  (2,   2.5,  4,  2),
  (2.5, 3,    6,  3),
  (3,   3.5,  8,  4),
  (3.5, 4,   12,  5),
  (4,   4.5, 16,  6),
  (4.5, NULL,20,  7);