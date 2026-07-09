
-- v2.66.91 — Annual Review System KPI slots ⇄ Library backfill + LTI/STI band repair
-- POLICY §AR-SYSTEM-KPI-LIBRARY-LINK
-- Idempotent, additive; safe to re-run.

DO $$
DECLARE
  tpl RECORD;
  slot_rec RECORD;
  new_arr jsonb;
  v_norm_name text;
  v_matched_key text;
  v_updated_count int := 0;
BEGIN
  CREATE TEMP TABLE _ar_kpi_aliases (norm_name text PRIMARY KEY, library_key text NOT NULL) ON COMMIT DROP;
  INSERT INTO _ar_kpi_aliases (norm_name, library_key) VALUES
    ('lost time injury (lti) rate',                                            'lti_rate'),
    ('short time injury (sti) rate',                                           'sti_rate'),
    ('departmental status of 5s',                                              's5'),
    ('trainings attended',                                                     'training_attended'),
    ('unsafe act / unsafe condition / near miss — reported by self',           'ua_uc_nm'),
    ('fugitive pm10 / aqi non-compliance days',                                'fugitive_pm10'),
    ('annual production target vs actual',                                     'annual_production'),
    ('annual preventive maintenance target vs actual',                         'annual_pm'),
    ('short time injury(sti) rate',                                            'sti_rate'),
    ('departmental status of 5s in ay 25-26',                                  's5'),
    ('traiining attended in ay 25-26',                                         'training_attended'),
    ('unsafe act unsafe condition near miss - reported by self',               'ua_uc_nm'),
    ('fugitive pm10/aqi non compliance days',                                  'fugitive_pm10'),
    ('annual maintenance preventive maintenance target vs. actual',            'annual_pm');

  FOR tpl IN
    SELECT id, sections FROM public.annual_review_templates
     WHERE jsonb_typeof(sections->'system_scores') = 'array'
  LOOP
    new_arr := '[]'::jsonb;
    FOR slot_rec IN
      SELECT value FROM jsonb_array_elements(tpl.sections->'system_scores')
    LOOP
      IF COALESCE(slot_rec.value->>'source','manual') = 'carry_kra'
         OR (slot_rec.value ? 'library_key')
      THEN
        new_arr := new_arr || jsonb_build_array(slot_rec.value);
      ELSE
        v_norm_name := lower(regexp_replace(trim(slot_rec.value->>'name'), '\s+', ' ', 'g'));
        SELECT a.library_key INTO v_matched_key
          FROM _ar_kpi_aliases a WHERE a.norm_name = v_norm_name;
        IF v_matched_key IS NOT NULL THEN
          new_arr := new_arr || jsonb_build_array(slot_rec.value || jsonb_build_object('library_key', v_matched_key));
        ELSE
          new_arr := new_arr || jsonb_build_array(slot_rec.value);
        END IF;
      END IF;
    END LOOP;

    IF new_arr IS DISTINCT FROM (tpl.sections->'system_scores') THEN
      UPDATE public.annual_review_templates
         SET sections   = jsonb_set(tpl.sections, '{system_scores}', new_arr, false),
             updated_at = now()
       WHERE id = tpl.id;
      v_updated_count := v_updated_count + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'v2.66.91 backfill: linked library_key on % template(s).', v_updated_count;
END $$;

-- Repair malformed worst-band threshold on LTI + STI.
UPDATE public.annual_review_system_kpis k
SET scoring_rules = jsonb_set(
      k.scoring_rules,
      '{bands}',
      (
        SELECT jsonb_agg(
                 CASE
                   WHEN jsonb_typeof(band->'threshold') = 'object'
                     THEN jsonb_set(band, '{threshold}', to_jsonb(999))
                   ELSE band
                 END
                 ORDER BY ord
               )
          FROM jsonb_array_elements(k.scoring_rules->'bands') WITH ORDINALITY AS b(band, ord)
      ),
      false
    ),
    updated_at = now()
WHERE k.key IN ('lti_rate','sti_rate')
  AND EXISTS (
    SELECT 1
      FROM jsonb_array_elements(k.scoring_rules->'bands') band
     WHERE jsonb_typeof(band->'threshold') = 'object'
  );

-- Post-condition — every alias-matchable slot MUST now be linked.
DO $$
DECLARE
  v_still_unlinked int;
BEGIN
  CREATE TEMP TABLE _ar_kpi_aliases_check (norm_name text PRIMARY KEY) ON COMMIT DROP;
  INSERT INTO _ar_kpi_aliases_check VALUES
    ('lost time injury (lti) rate'), ('short time injury (sti) rate'),
    ('departmental status of 5s'), ('trainings attended'),
    ('unsafe act / unsafe condition / near miss — reported by self'),
    ('fugitive pm10 / aqi non-compliance days'),
    ('annual production target vs actual'), ('annual preventive maintenance target vs actual'),
    ('short time injury(sti) rate'), ('departmental status of 5s in ay 25-26'),
    ('traiining attended in ay 25-26'),
    ('unsafe act unsafe condition near miss - reported by self'),
    ('fugitive pm10/aqi non compliance days'),
    ('annual maintenance preventive maintenance target vs. actual');

  SELECT COUNT(*) INTO v_still_unlinked
    FROM public.annual_review_templates t,
         LATERAL jsonb_array_elements(COALESCE(t.sections->'system_scores','[]'::jsonb)) s
         JOIN _ar_kpi_aliases_check a
           ON a.norm_name = lower(regexp_replace(trim(s->>'name'), '\s+', ' ', 'g'))
   WHERE COALESCE(s->>'source','manual') <> 'carry_kra'
     AND (s ? 'library_key') = false;

  IF v_still_unlinked > 0 THEN
    RAISE EXCEPTION 'v2.66.91 post-check failed: % scorable slot(s) still unlinked despite matching an alias.', v_still_unlinked;
  END IF;
END $$;
