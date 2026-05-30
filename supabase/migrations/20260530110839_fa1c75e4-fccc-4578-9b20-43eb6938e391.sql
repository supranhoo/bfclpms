ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS group_doj date;
COMMENT ON COLUMN public.profiles.group_doj IS 'Group Date of Joining — date employee joined the parent group.';