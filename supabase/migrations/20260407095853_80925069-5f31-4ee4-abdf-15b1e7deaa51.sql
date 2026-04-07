
-- Add company_id column to profiles table
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS company_id uuid REFERENCES public.companies(id);

-- Set BFCL as the company for ALL existing employees (active and inactive)
UPDATE public.profiles SET company_id = '1759cc34-254b-4d57-a90e-2a32c146cc9c' WHERE company_id IS NULL;
