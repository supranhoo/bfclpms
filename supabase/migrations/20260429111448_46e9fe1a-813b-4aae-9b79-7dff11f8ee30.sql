-- ============================================================================
-- Phase B: Server-side WebP compression — schema
-- ============================================================================

-- 1. Safety evidence: add compression tracking columns -----------------------
ALTER TABLE public.safety_incident_evidence
  ADD COLUMN IF NOT EXISTS compression_status text NOT NULL DEFAULT 'pending'
    CHECK (compression_status IN ('pending','processing','done','skipped','failed')),
  ADD COLUMN IF NOT EXISTS original_size_bytes bigint,
  ADD COLUMN IF NOT EXISTS compressed_at timestamptz,
  ADD COLUMN IF NOT EXISTS compression_attempts smallint NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS compression_error text,
  ADD COLUMN IF NOT EXISTS original_file_path text;

CREATE INDEX IF NOT EXISTS idx_safety_evidence_compression_pending
  ON public.safety_incident_evidence (compression_status, uploaded_at)
  WHERE compression_status IN ('pending','failed');

-- Backfill: existing rows are skipped (we don't reprocess history)
UPDATE public.safety_incident_evidence
   SET compression_status = 'skipped'
 WHERE compression_status = 'pending'
   AND uploaded_at < now() - interval '1 minute';

-- 2. PMS evidence compression queue -----------------------------------------
CREATE TABLE IF NOT EXISTS public.pms_evidence_compression_jobs (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table    text NOT NULL,           -- e.g. 'review_submissions'
  source_id       uuid NOT NULL,
  source_column   text NOT NULL,           -- e.g. 'self_evidence_urls'
  array_index     integer,                 -- index within JSONB array (NULL = scalar URL)
  original_url    text NOT NULL,
  original_path   text,                    -- bucket-relative path resolved server-side
  bucket_id       text,
  mime_type       text,
  original_size_bytes bigint,
  compressed_url  text,
  compressed_path text,
  compressed_size_bytes bigint,
  status          text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','done','skipped','failed')),
  attempts        smallint NOT NULL DEFAULT 0,
  last_error      text,
  enqueued_at     timestamptz NOT NULL DEFAULT now(),
  processed_at    timestamptz,
  rewritten_at    timestamptz,
  UNIQUE (source_table, source_id, source_column, array_index, original_url)
);

CREATE INDEX IF NOT EXISTS idx_pms_compress_pending
  ON public.pms_evidence_compression_jobs (status, enqueued_at)
  WHERE status IN ('pending','failed');

ALTER TABLE public.pms_evidence_compression_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage compression jobs"
  ON public.pms_evidence_compression_jobs
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- 3. Helper: detect image URL/path ------------------------------------------
CREATE OR REPLACE FUNCTION public.is_image_url(p_url text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path = public
AS $$
  SELECT p_url IS NOT NULL
     AND lower(p_url) ~ '\.(jpe?g|png|webp|heic|heif)(\?.*)?$';
$$;

-- 4. Trigger: enqueue Safety jobs on image inserts --------------------------
-- (Skipped when row inserted with explicit non-pending status, e.g. backfills)
CREATE OR REPLACE FUNCTION public.enqueue_safety_compression_on_insert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Only mark for compression if it's an image; otherwise mark skipped immediately.
  IF NEW.mime_type IS NOT NULL AND NEW.mime_type LIKE 'image/%'
     AND NEW.mime_type NOT IN ('image/gif','image/svg+xml','image/webp') THEN
    NEW.compression_status := 'pending';
    NEW.original_size_bytes := COALESCE(NEW.original_size_bytes, NEW.size_bytes);
  ELSE
    NEW.compression_status := 'skipped';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_safety_evidence_compress_enqueue
  ON public.safety_incident_evidence;
CREATE TRIGGER trg_safety_evidence_compress_enqueue
  BEFORE INSERT ON public.safety_incident_evidence
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_safety_compression_on_insert();

-- 5. Trigger: enqueue PMS jobs from review_submissions JSONB url arrays -----
CREATE OR REPLACE FUNCTION public.enqueue_pms_compression_jobs()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_col text;
  v_old jsonb;
  v_new jsonb;
  v_url text;
  v_idx integer;
  v_cols text[] := ARRAY[
    'self_evidence_urls','manager_evidence_urls','auditor_evidence_urls',
    'hr_pms_evidence_urls','management_evidence_urls','skip_level_evidence_urls'
  ];
BEGIN
  FOREACH v_col IN ARRAY v_cols LOOP
    EXECUTE format('SELECT to_jsonb($1.%I)', v_col) INTO v_new USING NEW;
    IF TG_OP = 'UPDATE' THEN
      EXECUTE format('SELECT to_jsonb($1.%I)', v_col) INTO v_old USING OLD;
    ELSE
      v_old := '[]'::jsonb;
    END IF;

    IF v_new IS NULL OR jsonb_typeof(v_new) <> 'array' THEN CONTINUE; END IF;

    v_idx := 0;
    FOR v_url IN SELECT jsonb_array_elements_text(v_new) LOOP
      IF public.is_image_url(v_url)
         AND (v_old IS NULL OR NOT v_old @> to_jsonb(v_url)) THEN
        INSERT INTO public.pms_evidence_compression_jobs
          (source_table, source_id, source_column, array_index, original_url)
        VALUES ('review_submissions', NEW.id, v_col, v_idx, v_url)
        ON CONFLICT (source_table, source_id, source_column, array_index, original_url)
        DO NOTHING;
      END IF;
      v_idx := v_idx + 1;
    END LOOP;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_pms_evidence_compress_enqueue
  ON public.review_submissions;
CREATE TRIGGER trg_pms_evidence_compress_enqueue
  AFTER INSERT OR UPDATE ON public.review_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.enqueue_pms_compression_jobs();

-- 6. Global settings --------------------------------------------------------
INSERT INTO public.system_settings (setting_key, setting_value, description) VALUES
  ('server_compression_enabled', 'true'::jsonb,
   'Master switch: when ON, the background job re-encodes uploaded images to WebP.'),
  ('server_compression_pms_rewrite', 'false'::jsonb,
   'When ON, the background job rewrites PMS evidence URLs in review_submissions after WebP re-encode succeeds. Default OFF for safe rollout.')
ON CONFLICT (setting_key) DO NOTHING;