ALTER TABLE public.app_settings
  ADD COLUMN IF NOT EXISTS assisted_photo_upload_required boolean NOT NULL DEFAULT true;

ALTER TABLE public.annual_review_proxy_submissions
  ADD COLUMN IF NOT EXISTS photo_upload_path text NULL;

COMMENT ON COLUMN public.app_settings.assisted_photo_upload_required IS
  'When true, the assisted Annual Review submission dialog requires the submitter to upload a photograph in addition to (or instead of) the live selfie. When false, the upload is offered but skippable.';

COMMENT ON COLUMN public.annual_review_proxy_submissions.photo_upload_path IS
  'Storage path of the uploaded photograph (proxy-selfies bucket, photos/ prefix). NULL when the submitter skipped the upload because the setting was optional.';