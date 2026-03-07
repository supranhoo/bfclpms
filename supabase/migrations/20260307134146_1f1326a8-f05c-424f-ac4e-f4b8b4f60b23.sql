ALTER TABLE public.profiles 
  ADD COLUMN is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN deactivated_at timestamptz;