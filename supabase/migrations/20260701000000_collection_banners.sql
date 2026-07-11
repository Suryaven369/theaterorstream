-- Shareable collections: a wide banner image (cover_image already exists as the
-- square thumbnail). Plus a public storage bucket for uploaded collection art.

ALTER TABLE public.user_collections
  ADD COLUMN IF NOT EXISTS banner_image text;

-- Public bucket; files live under "<uid>/..." so a user can only write their own.
INSERT INTO storage.buckets (id, name, public)
VALUES ('collection-images', 'collection-images', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "Public read collection images" ON storage.objects;
CREATE POLICY "Public read collection images" ON storage.objects
  FOR SELECT USING (bucket_id = 'collection-images');

DROP POLICY IF EXISTS "Owner upload collection images" ON storage.objects;
CREATE POLICY "Owner upload collection images" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'collection-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner update collection images" ON storage.objects;
CREATE POLICY "Owner update collection images" ON storage.objects
  FOR UPDATE TO authenticated
  USING (bucket_id = 'collection-images' AND (storage.foldername(name))[1] = auth.uid()::text);

DROP POLICY IF EXISTS "Owner delete collection images" ON storage.objects;
CREATE POLICY "Owner delete collection images" ON storage.objects
  FOR DELETE TO authenticated
  USING (bucket_id = 'collection-images' AND (storage.foldername(name))[1] = auth.uid()::text);

NOTIFY pgrst, 'reload schema';
