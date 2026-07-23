
-- ADR-138 (part 1 of 2): Add enum values for the new Management stage.
-- Postgres requires enum ADD VALUE to be committed before the value can be
-- referenced. This tiny migration lands the enum labels; the schema, RPCs,
-- trigger, backfill, and RLS updates land in part 2.

ALTER TYPE public.annual_reviewer_role   ADD VALUE IF NOT EXISTS 'management';
ALTER TYPE public.annual_review_status   ADD VALUE IF NOT EXISTS 'pending_management' BEFORE 'completed';
