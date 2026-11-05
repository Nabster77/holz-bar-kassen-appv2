/*
  # Keep PDF article imports working within the restricted bucket

  The admin screen also accepts PDF files as an image source and uploads them
  directly, so application/pdf is added back to the allowlist. HTML, SVG,
  JavaScript and every other active markup type stay rejected.
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/webp', 'application/pdf']
WHERE id = 'article-images';
