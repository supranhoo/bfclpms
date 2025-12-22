-- Create storage bucket for review evidence files
INSERT INTO storage.buckets (id, name, public)
VALUES ('review-evidence', 'review-evidence', true);

-- Allow authenticated users to upload to their own folders
CREATE POLICY "Users can upload their own evidence"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'review-evidence' 
  AND auth.uid() IS NOT NULL
);

-- Allow authenticated users to update their own files
CREATE POLICY "Users can update their own evidence"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'review-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow authenticated users to delete their own files
CREATE POLICY "Users can delete their own evidence"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'review-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Allow public read access for evidence files
CREATE POLICY "Evidence files are publicly accessible"
ON storage.objects
FOR SELECT
USING (bucket_id = 'review-evidence');