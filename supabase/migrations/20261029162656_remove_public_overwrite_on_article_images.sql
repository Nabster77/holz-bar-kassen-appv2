/*
  # Remove public overwrite on product images

  Uploads always use a fresh random file name, so the update verb is never
  used by the app. Removing it stops an outsider from replacing the content
  behind an image URL that is already shown in the product list.
*/

DROP POLICY IF EXISTS "anon_update_article_images" ON storage.objects;
