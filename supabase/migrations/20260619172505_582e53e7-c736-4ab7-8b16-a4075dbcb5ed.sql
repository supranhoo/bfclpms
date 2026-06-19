
-- 1. Library table
CREATE TABLE public.annual_review_self_review_library (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('field','bundle')),
  key text NOT NULL UNIQUE,
  category text NOT NULL DEFAULT 'general',
  label_en text NOT NULL,
  label_hi text,
  placeholder_en text,
  placeholder_hi text,
  required boolean NOT NULL DEFAULT false,
  is_builtin boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order int NOT NULL DEFAULT 0,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_self_review_library TO authenticated;
GRANT ALL ON public.annual_review_self_review_library TO service_role;
ALTER TABLE public.annual_review_self_review_library ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Library: read active to authenticated"
  ON public.annual_review_self_review_library FOR SELECT
  TO authenticated
  USING (is_active = true OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Library: admin/hr_pms insert"
  ON public.annual_review_self_review_library FOR INSERT
  TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Library: admin/hr_pms update"
  ON public.annual_review_self_review_library FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

CREATE POLICY "Library: admin/hr_pms delete non-builtin"
  ON public.annual_review_self_review_library FOR DELETE
  TO authenticated
  USING ((public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms')) AND is_builtin = false);

-- 2. Bundle child table
CREATE TABLE public.annual_review_self_review_bundle_items (
  bundle_id uuid NOT NULL REFERENCES public.annual_review_self_review_library(id) ON DELETE CASCADE,
  field_id  uuid NOT NULL REFERENCES public.annual_review_self_review_library(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  PRIMARY KEY (bundle_id, field_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.annual_review_self_review_bundle_items TO authenticated;
GRANT ALL ON public.annual_review_self_review_bundle_items TO service_role;
ALTER TABLE public.annual_review_self_review_bundle_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Bundle items: read to authenticated"
  ON public.annual_review_self_review_bundle_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "Bundle items: admin/hr_pms write"
  ON public.annual_review_self_review_bundle_items FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'hr_pms'));

-- 3. updated_at trigger
CREATE TRIGGER update_self_review_library_updated_at
  BEFORE UPDATE ON public.annual_review_self_review_library
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Guard: validate bundle/field kinds and prevent builtin hard-delete shortcuts
CREATE OR REPLACE FUNCTION public.validate_self_review_bundle_item()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  parent_kind text;
  child_kind text;
BEGIN
  SELECT kind INTO parent_kind FROM public.annual_review_self_review_library WHERE id = NEW.bundle_id;
  SELECT kind INTO child_kind FROM public.annual_review_self_review_library WHERE id = NEW.field_id;
  IF parent_kind <> 'bundle' THEN
    RAISE EXCEPTION 'bundle_id must reference a row with kind=bundle';
  END IF;
  IF child_kind <> 'field' THEN
    RAISE EXCEPTION 'field_id must reference a row with kind=field';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER validate_self_review_bundle_item
  BEFORE INSERT OR UPDATE ON public.annual_review_self_review_bundle_items
  FOR EACH ROW EXECUTE FUNCTION public.validate_self_review_bundle_item();

-- 5. Seed curated fields (12)
INSERT INTO public.annual_review_self_review_library
  (kind, key, category, label_en, label_hi, placeholder_en, placeholder_hi, required, is_builtin, sort_order) VALUES
  ('field','achievements','general','Key Achievements This Year','इस वर्ष की प्रमुख उपलब्धियाँ','List your top accomplishments…','अपनी प्रमुख उपलब्धियाँ लिखें…',true,true,10),
  ('field','challenges','general','Challenges Faced','सामना की गई चुनौतियाँ','Describe key challenges and how you handled them…','मुख्य चुनौतियाँ और उनसे निपटने का तरीका लिखें…',false,true,20),
  ('field','learnings','general','Key Learnings','मुख्य सीख','What did you learn this year?','इस वर्ष आपने क्या सीखा?',false,true,30),
  ('field','support_needed','general','Support Needed','आवश्यक सहयोग','What support do you need from your manager?','अपने प्रबंधक से किस प्रकार के सहयोग की आवश्यकता है?',false,true,40),
  ('field','goals_next_year','general','Goals for Next Year','अगले वर्ष के लक्ष्य','List your goals for the next review cycle…','अगले समीक्षा चक्र के लिए अपने लक्ष्य लिखें…',true,true,50),
  ('field','training_needs','general','Training & Development Needs','प्रशिक्षण और विकास की आवश्यकताएँ','Which skills do you want to develop?','कौन सी कुशलताएँ विकसित करना चाहते हैं?',false,true,60),
  ('field','peer_feedback','manager','Peer / Team Feedback','सहकर्मी / टीम प्रतिक्रिया','Feedback you would like to share about your team…','अपनी टीम के बारे में प्रतिक्रिया लिखें…',false,true,70),
  ('field','safety_observations','blue_collar','Safety Observations','सुरक्षा से जुड़ी टिप्पणियाँ','Any safety issues or near-misses observed?','क्या कोई सुरक्षा समस्या या निकट-दुर्घटना देखी गई?',false,true,80),
  ('field','ideas_innovation','general','Ideas / Innovation','विचार / नवाचार','Improvement ideas for the team or process…','टीम या प्रक्रिया में सुधार के विचार…',false,true,90),
  ('field','customer_feedback','manager','Customer Feedback Highlights','ग्राहक प्रतिक्रिया के मुख्य बिंदु','Notable customer praise or complaints…','उल्लेखनीय ग्राहक प्रशंसा या शिकायतें…',false,true,100),
  ('field','attendance_reflection','blue_collar','Attendance & Punctuality Reflection','उपस्थिति एवं समयनिष्ठा पर विचार','Your reflection on attendance and punctuality…','उपस्थिति एवं समयनिष्ठा पर अपने विचार लिखें…',false,true,110),
  ('field','tool_care','blue_collar','Care of Tools & Equipment','उपकरणों की देखभाल','How did you take care of tools and equipment?','उपकरणों की देखभाल कैसे की?',false,true,120);

-- 6. Seed two bundles
INSERT INTO public.annual_review_self_review_library
  (kind, key, category, label_en, label_hi, required, is_builtin, sort_order) VALUES
  ('bundle','bundle_blue_collar_5q','blue_collar','Blue-Collar Self Review (5 Questions)','ब्लू-कॉलर स्व-समीक्षा (5 प्रश्न)',false,true,1),
  ('bundle','bundle_manager_7q','manager','Manager Self Review (7 Questions)','प्रबंधक स्व-समीक्षा (7 प्रश्न)',false,true,2);

-- 7. Bundle items
INSERT INTO public.annual_review_self_review_bundle_items (bundle_id, field_id, position)
SELECT b.id, f.id, f.sort_order
FROM public.annual_review_self_review_library b
JOIN public.annual_review_self_review_library f ON f.kind='field'
WHERE b.key='bundle_blue_collar_5q'
  AND f.key IN ('attendance_reflection','safety_observations','tool_care','challenges','training_needs');

INSERT INTO public.annual_review_self_review_bundle_items (bundle_id, field_id, position)
SELECT b.id, f.id, f.sort_order
FROM public.annual_review_self_review_library b
JOIN public.annual_review_self_review_library f ON f.kind='field'
WHERE b.key='bundle_manager_7q'
  AND f.key IN ('achievements','challenges','learnings','peer_feedback','customer_feedback','goals_next_year','training_needs');
