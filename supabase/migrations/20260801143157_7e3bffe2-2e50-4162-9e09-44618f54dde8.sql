REVOKE EXECUTE ON FUNCTION public.ar_recommendation_queue(uuid,text,text,boolean,text,integer,integer,text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.ar_recommendation_queue(uuid,text,text,boolean,text,integer,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.ar_recommendation_queue(uuid,text,text,boolean,text,integer,integer,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ar_recommendation_queue(uuid,text,text,boolean,text,integer,integer,text) TO service_role;