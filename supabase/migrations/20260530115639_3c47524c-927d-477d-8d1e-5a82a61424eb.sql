ALTER TABLE public.profiles ADD COLUMN doj date;
COMMENT ON COLUMN public.profiles.doj IS 'Date of Joining — date employee joined the current company.';