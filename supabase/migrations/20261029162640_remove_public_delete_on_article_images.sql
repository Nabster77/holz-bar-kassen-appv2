/*
  # Remove public delete on product images

  The app never deletes objects; replacing an image uploads a new randomly
  named file. Public delete only allowed an outsider to wipe the images.
*/

DROP POLICY IF EXISTS "anon_delete_article_images" ON storage.objects;
