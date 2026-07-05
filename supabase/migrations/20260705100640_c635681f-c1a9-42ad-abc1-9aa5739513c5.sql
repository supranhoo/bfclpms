-- 1) CREATE TABLE
CREATE TABLE public.annual_review_template_archetypes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code text NOT NULL UNIQUE CHECK (code IN ('A','B','C','D')),
  name_en text NOT NULL,
  name_hi text,
  description_en text,
  description_hi text,
  default_criteria jsonb NOT NULL DEFAULT '[]'::jsonb,
  default_enabled_stages jsonb NOT NULL DEFAULT '["self","dept_head","bu_head"]'::jsonb,
  default_stage_weights jsonb NOT NULL DEFAULT '{"self":0,"dept_head":50,"bu_head":50}'::jsonb,
  display_mode text NOT NULL DEFAULT 'bilingual' CHECK (display_mode IN ('bilingual','en_only','hi_only')),
  applies_to_grade_buckets jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_by uuid,
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 2) GRANTS
GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_template_archetypes TO authenticated;
GRANT ALL ON public.annual_review_template_archetypes TO service_role;

-- 3) RLS
ALTER TABLE public.annual_review_template_archetypes ENABLE ROW LEVEL SECURITY;

-- 4) POLICIES
CREATE POLICY "Admin and HR PMS can view archetypes"
ON public.annual_review_template_archetypes FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

CREATE POLICY "Admin and HR PMS can manage archetypes"
ON public.annual_review_template_archetypes FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'))
WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'hr_pms'));

-- updated_at trigger
CREATE TRIGGER trg_annual_review_template_archetypes_updated_at
BEFORE UPDATE ON public.annual_review_template_archetypes
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed 4 canonical archetypes
INSERT INTO public.annual_review_template_archetypes
  (code, name_en, name_hi, description_en, description_hi, default_criteria, applies_to_grade_buckets, sort_order)
VALUES
  ('A',
   'KRA-Based Review',
   'केआरए-आधारित समीक्षा',
   'Employees with active KRAs for ≥ 1 month in the assessment year (July–June).',
   'मूल्यांकन वर्ष (जुलाई–जून) में ≥ 1 माह के लिए सक्रिय केआरए वाले कर्मचारी।',
   '[]'::jsonb,
   '["M","W","T","other"]'::jsonb,
   10),
  ('B',
   'No-KRA — Management (M1–M7)',
   'बिना केआरए — प्रबंधन (M1–M7)',
   'Management grade employees without KRAs in the assessment year. Uses shared qualitative criteria set.',
   'मूल्यांकन वर्ष में केआरए के बिना प्रबंधन ग्रेड के कर्मचारी। साझा गुणात्मक मानदंड सेट का उपयोग करता है।',
   '[
     {"key":"job_knowledge","label_en":"Job Knowledge & Skills","label_hi":"कार्य ज्ञान और कौशल","max_score":5},
     {"key":"quality_of_work","label_en":"Quality of Work","label_hi":"कार्य की गुणवत्ता","max_score":5},
     {"key":"productivity","label_en":"Productivity & Ownership","label_hi":"उत्पादकता और स्वामित्व","max_score":5},
     {"key":"teamwork","label_en":"Teamwork & Collaboration","label_hi":"टीम वर्क और सहयोग","max_score":5},
     {"key":"discipline","label_en":"Discipline & Attendance","label_hi":"अनुशासन और उपस्थिति","max_score":5},
     {"key":"safety_compliance","label_en":"Safety & Compliance","label_hi":"सुरक्षा और अनुपालन","max_score":5}
   ]'::jsonb,
   '["M"]'::jsonb,
   20),
  ('C',
   'No-KRA — Workmen (W1–W5)',
   'बिना केआरए — कर्मचारी (W1–W5)',
   'Workmen grade employees without KRAs. Uses shared qualitative criteria set with B/D.',
   'केआरए के बिना कर्मचारी ग्रेड। B/D के साथ साझा गुणात्मक मानदंड सेट का उपयोग करता है।',
   '[
     {"key":"job_knowledge","label_en":"Job Knowledge & Skills","label_hi":"कार्य ज्ञान और कौशल","max_score":5},
     {"key":"quality_of_work","label_en":"Quality of Work","label_hi":"कार्य की गुणवत्ता","max_score":5},
     {"key":"productivity","label_en":"Productivity & Ownership","label_hi":"उत्पादकता और स्वामित्व","max_score":5},
     {"key":"teamwork","label_en":"Teamwork & Collaboration","label_hi":"टीम वर्क और सहयोग","max_score":5},
     {"key":"discipline","label_en":"Discipline & Attendance","label_hi":"अनुशासन और उपस्थिति","max_score":5},
     {"key":"safety_compliance","label_en":"Safety & Compliance","label_hi":"सुरक्षा और अनुपालन","max_score":5}
   ]'::jsonb,
   '["W"]'::jsonb,
   30),
  ('D',
   'No-KRA — Trainees / Others (T)',
   'बिना केआरए — प्रशिक्षु / अन्य (T)',
   'Trainees and other grade employees without KRAs. Uses shared qualitative criteria set with B/C.',
   'केआरए के बिना प्रशिक्षु और अन्य ग्रेड के कर्मचारी। B/C के साथ साझा गुणात्मक मानदंड सेट का उपयोग करता है।',
   '[
     {"key":"job_knowledge","label_en":"Job Knowledge & Skills","label_hi":"कार्य ज्ञान और कौशल","max_score":5},
     {"key":"quality_of_work","label_en":"Quality of Work","label_hi":"कार्य की गुणवत्ता","max_score":5},
     {"key":"productivity","label_en":"Productivity & Ownership","label_hi":"उत्पादकता और स्वामित्व","max_score":5},
     {"key":"teamwork","label_en":"Teamwork & Collaboration","label_hi":"टीम वर्क और सहयोग","max_score":5},
     {"key":"discipline","label_en":"Discipline & Attendance","label_hi":"अनुशासन और उपस्थिति","max_score":5},
     {"key":"safety_compliance","label_en":"Safety & Compliance","label_hi":"सुरक्षा और अनुपालन","max_score":5}
   ]'::jsonb,
   '["T","other"]'::jsonb,
   40);