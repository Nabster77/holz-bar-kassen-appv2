/*
  # Restrict the product image bucket to image uploads

  Without a mime type restriction the public bucket accepted any file,
  including HTML and SVG that would then be served from a trusted URL.
  The list matches the formats the app imports (JPEG, PNG, BMP, WebP).
*/

UPDATE storage.buckets
SET allowed_mime_types = ARRAY['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/webp']
WHERE id = 'article-images';
