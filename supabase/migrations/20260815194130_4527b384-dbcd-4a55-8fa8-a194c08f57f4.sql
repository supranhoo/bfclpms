CREATE OR REPLACE FUNCTION public.bu_console_editable_fields()
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
  SELECT ARRAY[
    'kpi_title','kpi_description','kpi_formula','kpi_scoring_logic',
    'weightage','target_value','uom','uom_type','frequency','threshold_mode',
    'qualitative_options','r5','r4','r3','r2','r1','r0',
    'kra_name','category_id','criteria','source_of_data'
  ]::text[]
$function$;