REVOKE EXECUTE ON FUNCTION public.can_proxy_submit_annual_review(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.submit_annual_review_self_as_proxy(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_annual_review_directory_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_proxy_submit_annual_review(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_annual_review_self_as_proxy(uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_annual_review_directory_access() TO authenticated;