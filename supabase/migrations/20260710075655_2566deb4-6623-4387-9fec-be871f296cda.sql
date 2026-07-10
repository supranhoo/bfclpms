REVOKE EXECUTE ON FUNCTION public.annual_review_directory_access(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annual_review_directory_access(uuid) TO service_role;
REVOKE EXECUTE ON FUNCTION public.get_annual_review_directory_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_annual_review_directory_access() TO authenticated;