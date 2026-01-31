-- Make the review-evidence bucket public so files can be viewed
UPDATE storage.buckets
SET public = true
WHERE id = 'review-evidence';

-- Add RLS policy to allow authenticated users to view evidence files
CREATE POLICY "Authenticated users can view evidence files"
ON storage.objects FOR SELECT
USING (bucket_id = 'review-evidence' AND auth.role() = 'authenticated');

-- Add RLS policy to allow users to upload their own evidence files
CREATE POLICY "Users can upload their own evidence files"
ON storage.objects FOR INSERT
WITH CHECK (
  bucket_id = 'review-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add RLS policy to allow users to update their own evidence files
CREATE POLICY "Users can update their own evidence files"
ON storage.objects FOR UPDATE
USING (
  bucket_id = 'review-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);

-- Add RLS policy to allow users to delete their own evidence files
CREATE POLICY "Users can delete their own evidence files"
ON storage.objects FOR DELETE
USING (
  bucket_id = 'review-evidence' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);