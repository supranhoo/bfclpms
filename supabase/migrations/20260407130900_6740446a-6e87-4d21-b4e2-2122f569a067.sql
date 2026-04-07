
-- Add portal_access column to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS portal_access BOOLEAN NOT NULL DEFAULT true;

-- Drop FK constraint so profile-only rows (without auth account) are allowed
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_id_fkey;

-- Backfill: set portal_access = false for existing placeholder-email users
UPDATE public.profiles SET portal_access = false WHERE email LIKE '%@placeholder-pms.com';
