-- Create role enum for PMS roles
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'employee', 'auditor');

-- Create review status enum
CREATE TYPE public.review_status AS ENUM ('kra_set', 'self_review', 'manager_check', 'audit', 'approved');

-- Create rating enum
CREATE TYPE public.rating_level AS ENUM ('red', 'yellow', 'green', 'blue');

-- Profiles table for user information
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  full_name TEXT,
  employee_code TEXT UNIQUE,
  designation TEXT,
  pms_grade TEXT,
  department_id UUID,
  reporting_manager_id UUID REFERENCES public.profiles(id),
  avatar_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- User roles table (separate from profiles for security)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Organization hierarchy tables
CREATE TABLE public.divisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.business_units (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  division_id UUID REFERENCES public.divisions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_unit_id UUID REFERENCES public.business_units(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

CREATE TABLE public.sub_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT UNIQUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Add foreign key for department in profiles
ALTER TABLE public.profiles 
ADD CONSTRAINT profiles_department_fk 
FOREIGN KEY (department_id) REFERENCES public.departments(id);

-- KRA Categories table
CREATE TABLE public.kra_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  weightage DECIMAL(5,2) NOT NULL DEFAULT 0,
  color TEXT DEFAULT '#3B82F6',
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- KPIs table
CREATE TABLE public.kpis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id UUID REFERENCES public.kra_categories(id) ON DELETE CASCADE NOT NULL,
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  kra_name TEXT NOT NULL,
  kpi_name TEXT NOT NULL,
  uom TEXT,
  criteria TEXT,
  target_value DECIMAL(10,2),
  weightage DECIMAL(5,2) DEFAULT 0,
  review_period TEXT,
  review_year INTEGER DEFAULT EXTRACT(YEAR FROM CURRENT_DATE),
  status review_status DEFAULT 'kra_set',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Performance Reviews table (for each review cycle)
CREATE TABLE public.performance_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  review_period TEXT NOT NULL,
  review_year INTEGER NOT NULL,
  overall_score DECIMAL(5,2),
  overall_rating rating_level,
  status review_status DEFAULT 'kra_set',
  manager_remarks TEXT,
  auditor_remarks TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Review Submissions table (self/manager/auditor ratings)
CREATE TABLE public.review_submissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kpi_id UUID REFERENCES public.kpis(id) ON DELETE CASCADE NOT NULL,
  performance_review_id UUID REFERENCES public.performance_reviews(id) ON DELETE CASCADE,
  achieved_value DECIMAL(10,2),
  self_rating rating_level,
  self_score DECIMAL(5,2),
  self_remarks TEXT,
  self_evidence_url TEXT,
  manager_rating rating_level,
  manager_score DECIMAL(5,2),
  manager_remarks TEXT,
  auditor_rating rating_level,
  auditor_score DECIMAL(5,2),
  auditor_remarks TEXT,
  final_rating rating_level,
  final_score DECIMAL(5,2),
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL
);

-- Enable RLS on all tables
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.divisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.business_units ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sub_branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kra_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.kpis ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.performance_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.review_submissions ENABLE ROW LEVEL SECURITY;

-- Security definer function to check user roles (prevents RLS recursion)
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Function to get user's role
CREATE OR REPLACE FUNCTION public.get_user_role(_user_id UUID)
RETURNS app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.user_roles WHERE user_id = _user_id LIMIT 1
$$;

-- Profiles RLS policies
CREATE POLICY "Users can view their own profile"
ON public.profiles FOR SELECT
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can view all profiles"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Managers can view their direct reports"
ON public.profiles FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'manager') AND reporting_manager_id = auth.uid());

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
TO authenticated
USING (auth.uid() = id);

CREATE POLICY "Admins can manage all profiles"
ON public.profiles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- User roles RLS policies
CREATE POLICY "Users can view their own roles"
ON public.user_roles FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Admins can manage all roles"
ON public.user_roles FOR ALL
TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Organization tables - viewable by all authenticated, manageable by admins
CREATE POLICY "Authenticated users can view divisions"
ON public.divisions FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage divisions"
ON public.divisions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view business_units"
ON public.business_units FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage business_units"
ON public.business_units FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view departments"
ON public.departments FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage departments"
ON public.departments FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Authenticated users can view sub_branches"
ON public.sub_branches FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage sub_branches"
ON public.sub_branches FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- KRA Categories policies
CREATE POLICY "Authenticated users can view kra_categories"
ON public.kra_categories FOR SELECT TO authenticated USING (true);

CREATE POLICY "Admins can manage kra_categories"
ON public.kra_categories FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- KPIs policies
CREATE POLICY "Employees can view their own KPIs"
ON public.kpis FOR SELECT TO authenticated
USING (employee_id = auth.uid());

CREATE POLICY "Managers can view their reports' KPIs"
ON public.kpis FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'manager') AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = employee_id AND reporting_manager_id = auth.uid())
);

CREATE POLICY "Admins and auditors can view all KPIs"
ON public.kpis FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'auditor'));

CREATE POLICY "Admins can manage all KPIs"
ON public.kpis FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Performance Reviews policies
CREATE POLICY "Employees can view their own reviews"
ON public.performance_reviews FOR SELECT TO authenticated
USING (employee_id = auth.uid());

CREATE POLICY "Managers can view their reports' reviews"
ON public.performance_reviews FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'manager') AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = employee_id AND reporting_manager_id = auth.uid())
);

CREATE POLICY "Managers can update their reports' reviews"
ON public.performance_reviews FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'manager') AND
  EXISTS (SELECT 1 FROM public.profiles WHERE id = employee_id AND reporting_manager_id = auth.uid())
);

CREATE POLICY "Admins and auditors can view all reviews"
ON public.performance_reviews FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'auditor'));

CREATE POLICY "Auditors can update reviews"
ON public.performance_reviews FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'auditor'));

CREATE POLICY "Admins can manage all reviews"
ON public.performance_reviews FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Review Submissions policies
CREATE POLICY "Employees can view their own submissions"
ON public.review_submissions FOR SELECT TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.kpis WHERE id = kpi_id AND employee_id = auth.uid())
);

CREATE POLICY "Employees can create/update their own submissions"
ON public.review_submissions FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (SELECT 1 FROM public.kpis WHERE id = kpi_id AND employee_id = auth.uid())
);

CREATE POLICY "Employees can update self review fields"
ON public.review_submissions FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.kpis WHERE id = kpi_id AND employee_id = auth.uid())
);

CREATE POLICY "Managers can view their reports' submissions"
ON public.review_submissions FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'manager') AND
  EXISTS (
    SELECT 1 FROM public.kpis k
    JOIN public.profiles p ON k.employee_id = p.id
    WHERE k.id = kpi_id AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Managers can update their reports' submissions"
ON public.review_submissions FOR UPDATE TO authenticated
USING (
  public.has_role(auth.uid(), 'manager') AND
  EXISTS (
    SELECT 1 FROM public.kpis k
    JOIN public.profiles p ON k.employee_id = p.id
    WHERE k.id = kpi_id AND p.reporting_manager_id = auth.uid()
  )
);

CREATE POLICY "Admins and auditors can view all submissions"
ON public.review_submissions FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'auditor'));

CREATE POLICY "Auditors can update submissions"
ON public.review_submissions FOR UPDATE TO authenticated
USING (public.has_role(auth.uid(), 'auditor'));

CREATE POLICY "Admins can manage all submissions"
ON public.review_submissions FOR ALL TO authenticated
USING (public.has_role(auth.uid(), 'admin'));

-- Trigger to create profile on user signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, NEW.raw_user_meta_data ->> 'full_name');
  
  -- Assign default 'employee' role
  INSERT INTO public.user_roles (user_id, role)
  VALUES (NEW.id, 'employee');
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to update updated_at timestamp
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_kpis_updated_at
  BEFORE UPDATE ON public.kpis
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_performance_reviews_updated_at
  BEFORE UPDATE ON public.performance_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_review_submissions_updated_at
  BEFORE UPDATE ON public.review_submissions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Insert sample KRA categories
INSERT INTO public.kra_categories (name, weightage, color, description) VALUES
('Financial', 25.00, '#EF4444', 'Financial performance and revenue targets'),
('Customer', 25.00, '#F59E0B', 'Customer satisfaction and relationship metrics'),
('Internal Process', 25.00, '#3B82F6', 'Operational efficiency and process improvement'),
('Learning & Growth', 25.00, '#10B981', 'Personal development and skill enhancement');

-- Insert sample divisions
INSERT INTO public.divisions (name, code) VALUES
('Operations', 'OPS'),
('Technology', 'TECH'),
('Human Resources', 'HR'),
('Finance', 'FIN');

-- Insert sample business units
INSERT INTO public.business_units (division_id, name, code)
SELECT d.id, 'Core Operations', 'CORE-OPS' FROM public.divisions d WHERE d.code = 'OPS'
UNION ALL
SELECT d.id, 'Software Development', 'SW-DEV' FROM public.divisions d WHERE d.code = 'TECH'
UNION ALL
SELECT d.id, 'Talent Management', 'TM' FROM public.divisions d WHERE d.code = 'HR'
UNION ALL
SELECT d.id, 'Accounting', 'ACC' FROM public.divisions d WHERE d.code = 'FIN';

-- Insert sample departments
INSERT INTO public.departments (business_unit_id, name, code)
SELECT bu.id, 'Production', 'PROD' FROM public.business_units bu WHERE bu.code = 'CORE-OPS'
UNION ALL
SELECT bu.id, 'Quality Assurance', 'QA' FROM public.business_units bu WHERE bu.code = 'SW-DEV'
UNION ALL
SELECT bu.id, 'Recruitment', 'REC' FROM public.business_units bu WHERE bu.code = 'TM'
UNION ALL
SELECT bu.id, 'Financial Planning', 'FP' FROM public.business_units bu WHERE bu.code = 'ACC';