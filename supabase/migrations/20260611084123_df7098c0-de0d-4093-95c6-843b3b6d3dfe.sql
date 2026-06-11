ALTER TABLE public.safety_incident_routing_rules ALTER COLUMN manager_id DROP NOT NULL;
ALTER TABLE public.safety_incident_routing_rules ALTER COLUMN second_manager_id DROP NOT NULL;