
CREATE TABLE public.menu_access_user_overrides (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  menu_key TEXT NOT NULL,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  granted_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (menu_key, user_id)
);

ALTER TABLE public.menu_access_user_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone authenticated can read menu user overrides"
  ON public.menu_access_user_overrides FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can insert menu user overrides"
  ON public.menu_access_user_overrides FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete menu user overrides"
  ON public.menu_access_user_overrides FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
