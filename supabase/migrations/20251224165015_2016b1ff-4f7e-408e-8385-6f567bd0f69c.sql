-- Add management review columns to review_submissions
ALTER TABLE public.review_submissions 
  ADD COLUMN IF NOT EXISTS management_rating rating_level,
  ADD COLUMN IF NOT EXISTS management_score numeric,
  ADD COLUMN IF NOT EXISTS management_remarks text;

-- RLS policies for management role
-- Management can view all KPIs
CREATE POLICY "Management can view all KPIs" 
ON public.kpis 
FOR SELECT 
USING (has_role(auth.uid(), 'management'::app_role));

-- Management can view all submissions
CREATE POLICY "Management can view all submissions" 
ON public.review_submissions 
FOR SELECT 
USING (has_role(auth.uid(), 'management'::app_role));

-- Management can update submissions during management review
CREATE POLICY "Management can update submissions during review" 
ON public.review_submissions 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'management'::app_role) AND 
  EXISTS (
    SELECT 1 FROM public.kpis k 
    WHERE k.id = review_submissions.kpi_id 
    AND k.status = 'management_review'
  )
);

-- Management can view all profiles
CREATE POLICY "Management can view all profiles" 
ON public.profiles 
FOR SELECT 
USING (has_role(auth.uid(), 'management'::app_role));

-- Management can view all performance reviews
CREATE POLICY "Management can view all reviews" 
ON public.performance_reviews 
FOR SELECT 
USING (has_role(auth.uid(), 'management'::app_role));

-- Management can update performance reviews
CREATE POLICY "Management can update reviews" 
ON public.performance_reviews 
FOR UPDATE 
USING (has_role(auth.uid(), 'management'::app_role));

-- Management can view audit logs
CREATE POLICY "Management can view audit logs" 
ON public.kpi_audit_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'management'::app_role));

-- Management can view queries
CREATE POLICY "Management can view all queries" 
ON public.kpi_queries 
FOR SELECT 
USING (has_role(auth.uid(), 'management'::app_role));