/*
# Create article-images storage bucket

## What this does
Creates a public Supabase Storage bucket named `article-images` so that
product images uploaded in the admin screen are stored server-side and
visible on every device that opens the app — not just the device that
uploaded them.

## Storage bucket
- `article-images` — public bucket (anyone can read via public URL),
  writes allowed for anon + authenticated (no sign-in in this app).

## Security
- Public read on the bucket (images are product photos, intentionally shared).
- Insert / update / delete allowed for anon + authenticated (no-auth app).
- 5 MB file size limit enforced via bucket settings.
*/

-- Create the bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit)
VALUES ('article-images', 'article-images', true, 5242880)
ON CONFLICT (id) DO UPDATE SET
  public = true,
  file_size_limit = 5242880;

-- Public read policy (anyone can view article images)
DROP POLICY IF EXISTS "public_read_article_images" ON storage.objects;
CREATE POLICY "public_read_article_images"
ON storage.objects FOR SELECT
TO anon, authenticated
USING (bucket_id = 'article-images');

-- Allow anon + authenticated to upload
DROP POLICY IF EXISTS "anon_insert_article_images" ON storage.objects;
CREATE POLICY "anon_insert_article_images"
ON storage.objects FOR INSERT
TO anon, authenticated
WITH CHECK (bucket_id = 'article-images');

-- Allow anon + authenticated to update (re-upload / replace)
DROP POLICY IF EXISTS "anon_update_article_images" ON storage.objects;
CREATE POLICY "anon_update_article_images"
ON storage.objects FOR UPDATE
TO anon, authenticated
USING (bucket_id = 'article-images')
WITH CHECK (bucket_id = 'article-images');

-- Allow anon + authenticated to delete
DROP POLICY IF EXISTS "anon_delete_article_images" ON storage.objects;
CREATE POLICY "anon_delete_article_images"
ON storage.objects FOR DELETE
TO anon, authenticated
USING (bucket_id = 'article-images');
