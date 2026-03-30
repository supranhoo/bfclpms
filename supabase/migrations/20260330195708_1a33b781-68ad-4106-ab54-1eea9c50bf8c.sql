
CREATE TABLE public.incentive_slab_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  value text UNIQUE NOT NULL,
  label text NOT NULL,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.incentive_slab_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated read" ON public.incentive_slab_categories
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admin manage" ON public.incentive_slab_categories
  FOR ALL TO authenticated USING (public.has_role(auth.uid(), 'admin'));

INSERT INTO public.incentive_slab_categories (value, label, sort_order) VALUES
  ('pms_score', 'PMS Score', 1),
  ('production', 'Production', 2),
  ('availability', 'Availability', 3),
  ('maintenance', 'Maintenance', 4),
  ('metal_recovery', 'Metal Recovery', 5);
