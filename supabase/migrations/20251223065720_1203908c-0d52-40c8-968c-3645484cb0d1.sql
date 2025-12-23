-- Fix storage bucket security: make review-evidence bucket private
UPDATE storage.buckets SET public = false WHERE id = 'review-evidence';

-- Drop the overly permissive public SELECT policy
DROP POLICY IF EXISTS "Evidence files are publicly accessible" ON storage.objects;

-- Create a restrictive SELECT policy that checks ownership and authorization
CREATE POLICY "Users can view authorized evidence"
ON storage.objects FOR SELECT
USING (
  bucket_id = 'review-evidence' AND (
    -- File owner can view
    auth.uid()::text = (storage.foldername(name))[1] OR
    -- Admins can view all
    public.has_role(auth.uid(), 'admin') OR
    -- Auditors can view all
    public.has_role(auth.uid(), 'auditor') OR
    -- Managers can view their reports' files
    EXISTS (
      SELECT 1 FROM public.profiles 
      WHERE id::text = (storage.foldername(name))[1] 
      AND reporting_manager_id = auth.uid()
    )
  )
);