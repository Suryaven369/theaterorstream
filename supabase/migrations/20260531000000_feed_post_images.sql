-- Feed post images: store an uploaded image URL on posts, backed by a public Storage bucket.

-- 1. Column to hold the uploaded image's public URL
ALTER TABLE public.feed_posts
  ADD COLUMN IF NOT EXISTS image_url text;

-- 2. Public storage bucket for post images
INSERT INTO storage.buckets (id, name, public)
VALUES ('post-images', 'post-images', true)
ON CONFLICT (id) DO NOTHING;

-- 3. Storage RLS — anyone can read (bucket is public), but only authenticated users can
--    upload/modify/delete files inside their OWN folder (path = "<uid>/<file>"). This stops
--    a user from writing into or deleting another user's images.
DROP POLICY IF EXISTS "Public read post images" ON storage.objects;
CREATE POLICY "Public read post images" ON storage.objects
  FOR SELECT
  USING (bucket_id = 'post-images');

DROP POLICY IF EXISTS "Users upload own post images" ON storage.objects;
CREATE POLICY "Users upload own post images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users update own post images" ON storage.objects;
CREATE POLICY "Users update own post images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

DROP POLICY IF EXISTS "Users delete own post images" ON storage.objects;
CREATE POLICY "Users delete own post images" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'post-images'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );
