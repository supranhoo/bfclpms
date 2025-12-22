-- Create table to track import progress
CREATE TABLE public.import_progress (
  id TEXT PRIMARY KEY,
  user_id UUID NOT NULL,
  status TEXT NOT NULL DEFAULT 'running', -- 'running', 'completed', 'failed'
  total_rows INTEGER NOT NULL DEFAULT 0,
  processed_rows INTEGER NOT NULL DEFAULT 0,
  kpis_imported INTEGER NOT NULL DEFAULT 0,
  employees_created INTEGER NOT NULL DEFAULT 0,
  categories_created INTEGER NOT NULL DEFAULT 0,
  errors JSONB DEFAULT '[]',
  started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  completed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.import_progress ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see their own import progress
CREATE POLICY "Users can view their own import progress" 
ON public.import_progress 
FOR SELECT 
USING (auth.uid() = user_id);

-- Policy: Admins can insert (we'll use service role in edge function)
-- No insert policy needed as edge function uses service role key

-- Add trigger for updated_at
CREATE TRIGGER update_import_progress_updated_at
BEFORE UPDATE ON public.import_progress
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Enable realtime for this table
ALTER PUBLICATION supabase_realtime ADD TABLE public.import_progress;