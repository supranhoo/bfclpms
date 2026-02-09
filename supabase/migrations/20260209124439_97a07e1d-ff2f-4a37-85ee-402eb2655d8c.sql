
-- frequency_config
DROP POLICY IF EXISTS "Authenticated users can view frequency_config" ON frequency_config;
CREATE POLICY "Authenticated users can view frequency_config"
  ON frequency_config FOR SELECT
  TO authenticated
  USING (true);

-- review_periods
DROP POLICY IF EXISTS "Authenticated users can view review_periods" ON review_periods;
CREATE POLICY "Authenticated users can view review_periods"
  ON review_periods FOR SELECT
  TO authenticated
  USING (true);

-- workflow_config
DROP POLICY IF EXISTS "Authenticated users can view workflow_config" ON workflow_config;
CREATE POLICY "Authenticated users can view workflow_config"
  ON workflow_config FOR SELECT
  TO authenticated
  USING (true);

-- workflow_templates
DROP POLICY IF EXISTS "Authenticated users can view workflow_templates" ON workflow_templates;
CREATE POLICY "Authenticated users can view workflow_templates"
  ON workflow_templates FOR SELECT
  TO authenticated
  USING (true);
