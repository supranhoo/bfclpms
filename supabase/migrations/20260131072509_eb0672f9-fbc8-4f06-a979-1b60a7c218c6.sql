-- =====================================================
-- PMS Frequency & Sub-Frequency Logic - Database Schema
-- =====================================================

-- 1. Create sub_period_submissions table for Daily/Weekly granular submissions
CREATE TABLE public.sub_period_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID NOT NULL REFERENCES public.kpis(id) ON DELETE CASCADE,
  sub_period_type TEXT NOT NULL CHECK (sub_period_type IN ('daily', 'weekly')),
  sub_period_value TEXT NOT NULL, -- '2026-01-15' for daily, '1'-'5' for week number
  achieved_value NUMERIC,
  remarks TEXT,
  evidence_url TEXT,
  submitted_at TIMESTAMPTZ DEFAULT now(),
  submitted_by UUID REFERENCES public.profiles(id),
  review_month TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE(kpi_id, sub_period_type, sub_period_value, review_month, review_year)
);

-- Create index for performance
CREATE INDEX idx_sub_period_submissions_kpi_period ON public.sub_period_submissions(kpi_id, review_month, review_year);
CREATE INDEX idx_sub_period_submissions_submitted_by ON public.sub_period_submissions(submitted_by);

-- Enable RLS
ALTER TABLE public.sub_period_submissions ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sub_period_submissions
CREATE POLICY "Employees can view their own sub-period submissions"
ON public.sub_period_submissions FOR SELECT
USING (EXISTS (
  SELECT 1 FROM kpis WHERE kpis.id = sub_period_submissions.kpi_id AND kpis.employee_id = auth.uid()
));

CREATE POLICY "Employees can create their own sub-period submissions"
ON public.sub_period_submissions FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM kpis WHERE kpis.id = sub_period_submissions.kpi_id AND kpis.employee_id = auth.uid()
));

CREATE POLICY "Employees can update their own sub-period submissions"
ON public.sub_period_submissions FOR UPDATE
USING (EXISTS (
  SELECT 1 FROM kpis WHERE kpis.id = sub_period_submissions.kpi_id AND kpis.employee_id = auth.uid()
));

CREATE POLICY "Managers can view their reports' sub-period submissions"
ON public.sub_period_submissions FOR SELECT
USING (
  has_role(auth.uid(), 'manager'::app_role) AND EXISTS (
    SELECT 1 FROM kpis k
    JOIN profiles p ON k.employee_id = p.id
    WHERE k.id = sub_period_submissions.kpi_id AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage all sub-period submissions"
ON public.sub_period_submissions FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Auditors can view all sub-period submissions"
ON public.sub_period_submissions FOR SELECT
USING (has_role(auth.uid(), 'auditor'::app_role));

CREATE POLICY "Management can view all sub-period submissions"
ON public.sub_period_submissions FOR SELECT
USING (has_role(auth.uid(), 'management'::app_role));

-- 2. Create frequency_config table for system configuration
CREATE TABLE public.frequency_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  frequency TEXT NOT NULL UNIQUE,
  sub_frequency TEXT NOT NULL,
  review_window_rules JSONB,
  locked_months JSONB,
  active_month INTEGER,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.frequency_config ENABLE ROW LEVEL SECURITY;

-- RLS Policies for frequency_config
CREATE POLICY "Authenticated users can view frequency_config"
ON public.frequency_config FOR SELECT
USING (true);

CREATE POLICY "Admins can manage frequency_config"
ON public.frequency_config FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Seed frequency configuration data
INSERT INTO public.frequency_config (frequency, sub_frequency, review_window_rules, locked_months, active_month, description) VALUES
('Daily', 'Daily', '{"rolling_window": 1, "allow_today": true, "allow_yesterday": true}', NULL, NULL, 'Daily submissions with rolling 2-day window'),
('Weekly', 'Weekly', '{"week_1": {"start": 8, "end": 10}, "week_2": {"start": 15, "end": 18}, "week_3": {"start": 22, "end": 24}, "week_4": {"start": 29, "end": 31}, "week_5": {"start": 5, "end": 8, "next_month": true}}', NULL, NULL, 'Weekly submissions with defined review windows'),
('Monthly', 'Monthly', NULL, NULL, NULL, 'Standard monthly submission'),
('Bi-Monthly', 'Jan-Feb,Mar-Apr,May-Jun,Jul-Aug,Sep-Oct,Nov-Dec', NULL, '{"Jan-Feb": [1], "Mar-Apr": [3], "May-Jun": [5], "Jul-Aug": [7], "Sep-Oct": [9], "Nov-Dec": [11]}', 2, 'Bi-monthly cycles, review in second month'),
('Quarterly', 'Jan-Mar,Apr-Jun,Jul-Sep,Oct-Dec', NULL, '{"Q1": [1, 2], "Q2": [4, 5], "Q3": [7, 8], "Q4": [10, 11]}', 3, 'Quarterly cycles, review in final month'),
('Half-Yearly', 'Jan-Jun,Jul-Dec', NULL, '{"H1": [1, 2, 3, 4, 5], "H2": [7, 8, 9, 10, 11]}', 6, 'Half-yearly cycles, review in final month'),
('Yearly', 'Jan-Dec', NULL, '{"Jan-Dec": [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]}', 12, 'Yearly cycle, review in final month');

-- 3. Add new columns to kpis table
ALTER TABLE public.kpis
  ADD COLUMN IF NOT EXISTS sub_frequency TEXT,
  ADD COLUMN IF NOT EXISTS frequency_cycle_start TEXT,
  ADD COLUMN IF NOT EXISTS is_frequency_locked BOOLEAN DEFAULT false;

-- 4. Create function to aggregate sub-period scores into monthly score
CREATE OR REPLACE FUNCTION public.aggregate_sub_period_scores(p_kpi_id UUID, p_month TEXT, p_year INTEGER)
RETURNS NUMERIC AS $$
DECLARE
  v_frequency TEXT;
  v_avg_score NUMERIC;
BEGIN
  SELECT frequency INTO v_frequency FROM public.kpis WHERE id = p_kpi_id;
  
  IF v_frequency IN ('Daily', 'Weekly') THEN
    SELECT AVG(achieved_value) INTO v_avg_score
    FROM public.sub_period_submissions
    WHERE kpi_id = p_kpi_id 
      AND review_month = p_month 
      AND review_year = p_year
      AND achieved_value IS NOT NULL;
  END IF;
  
  RETURN COALESCE(v_avg_score, 0);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- 5. Create function to get cycle months for multi-month frequencies
CREATE OR REPLACE FUNCTION public.get_cycle_months(p_frequency TEXT, p_month TEXT, p_year INTEGER)
RETURNS TEXT[] AS $$
DECLARE
  v_month_num INTEGER;
  v_cycle_months TEXT[];
  v_months TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June', 
                            'July', 'August', 'September', 'October', 'November', 'December'];
BEGIN
  -- Get month number (1-12)
  v_month_num := array_position(v_months, p_month);
  
  IF v_month_num IS NULL THEN
    RETURN ARRAY[]::TEXT[];
  END IF;
  
  CASE p_frequency
    WHEN 'Bi-Monthly' THEN
      -- Bi-monthly pairs: Jan-Feb, Mar-Apr, etc.
      IF v_month_num % 2 = 1 THEN
        v_cycle_months := ARRAY[v_months[v_month_num], v_months[v_month_num + 1]];
      ELSE
        v_cycle_months := ARRAY[v_months[v_month_num - 1], v_months[v_month_num]];
      END IF;
    WHEN 'Quarterly' THEN
      -- Q1: Jan-Mar, Q2: Apr-Jun, Q3: Jul-Sep, Q4: Oct-Dec
      CASE 
        WHEN v_month_num <= 3 THEN v_cycle_months := ARRAY['January', 'February', 'March'];
        WHEN v_month_num <= 6 THEN v_cycle_months := ARRAY['April', 'May', 'June'];
        WHEN v_month_num <= 9 THEN v_cycle_months := ARRAY['July', 'August', 'September'];
        ELSE v_cycle_months := ARRAY['October', 'November', 'December'];
      END CASE;
    WHEN 'Half-Yearly' THEN
      IF v_month_num <= 6 THEN
        v_cycle_months := ARRAY['January', 'February', 'March', 'April', 'May', 'June'];
      ELSE
        v_cycle_months := ARRAY['July', 'August', 'September', 'October', 'November', 'December'];
      END IF;
    WHEN 'Yearly' THEN
      v_cycle_months := v_months;
    ELSE
      v_cycle_months := ARRAY[p_month];
  END CASE;
  
  RETURN v_cycle_months;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- 6. Create function to check if a month is locked for a frequency
CREATE OR REPLACE FUNCTION public.is_month_locked_for_frequency(p_frequency TEXT, p_month TEXT, p_year INTEGER)
RETURNS BOOLEAN AS $$
DECLARE
  v_month_num INTEGER;
  v_cycle_months TEXT[];
  v_active_month INTEGER;
  v_months TEXT[] := ARRAY['January', 'February', 'March', 'April', 'May', 'June', 
                            'July', 'August', 'September', 'October', 'November', 'December'];
BEGIN
  v_month_num := array_position(v_months, p_month);
  
  IF v_month_num IS NULL OR p_frequency IN ('Daily', 'Weekly', 'Monthly') THEN
    RETURN false;
  END IF;
  
  v_cycle_months := public.get_cycle_months(p_frequency, p_month, p_year);
  
  -- Check if current month is the active (final) month of the cycle
  CASE p_frequency
    WHEN 'Bi-Monthly' THEN
      RETURN v_month_num % 2 = 1; -- Locked in odd months (Jan, Mar, May, etc.)
    WHEN 'Quarterly' THEN
      RETURN v_month_num % 3 != 0; -- Locked if not Mar, Jun, Sep, Dec
    WHEN 'Half-Yearly' THEN
      RETURN v_month_num NOT IN (6, 12); -- Locked if not Jun or Dec
    WHEN 'Yearly' THEN
      RETURN v_month_num != 12; -- Locked if not December
    ELSE
      RETURN false;
  END CASE;
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

-- 7. Create trigger function to auto-update sub_frequency based on frequency
CREATE OR REPLACE FUNCTION public.sync_sub_frequency()
RETURNS TRIGGER AS $$
BEGIN
  CASE NEW.frequency
    WHEN 'Daily' THEN NEW.sub_frequency := 'Daily';
    WHEN 'Weekly' THEN NEW.sub_frequency := 'Weekly';
    WHEN 'Monthly' THEN NEW.sub_frequency := 'Monthly';
    WHEN 'Bi-Monthly' THEN 
      NEW.sub_frequency := CASE 
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 2 THEN 'Jan-Feb'
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 4 THEN 'Mar-Apr'
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 6 THEN 'May-Jun'
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 8 THEN 'Jul-Aug'
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 10 THEN 'Sep-Oct'
        ELSE 'Nov-Dec'
      END;
    WHEN 'Quarterly' THEN
      NEW.sub_frequency := CASE 
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 3 THEN 'Jan-Mar'
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 6 THEN 'Apr-Jun'
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 9 THEN 'Jul-Sep'
        ELSE 'Oct-Dec'
      END;
    WHEN 'Half-Yearly' THEN
      NEW.sub_frequency := CASE 
        WHEN EXTRACT(MONTH FROM CURRENT_DATE) <= 6 THEN 'Jan-Jun'
        ELSE 'Jul-Dec'
      END;
    WHEN 'Yearly' THEN
      NEW.sub_frequency := COALESCE(NEW.frequency_cycle_start, 'Jan-Dec');
    ELSE
      NEW.sub_frequency := NEW.frequency;
  END CASE;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger for auto-syncing sub_frequency
DROP TRIGGER IF EXISTS sync_kpi_sub_frequency ON public.kpis;
CREATE TRIGGER sync_kpi_sub_frequency
  BEFORE INSERT OR UPDATE OF frequency, frequency_cycle_start ON public.kpis
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_sub_frequency();

-- 8. Create trigger to update updated_at on sub_period_submissions
CREATE OR REPLACE FUNCTION public.update_sub_period_submissions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_sub_period_submissions_updated_at
  BEFORE UPDATE ON public.sub_period_submissions
  FOR EACH ROW
  EXECUTE FUNCTION public.update_sub_period_submissions_updated_at();