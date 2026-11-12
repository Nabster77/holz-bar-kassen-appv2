-- WOODMO_V3.0: Nach erfolgreicher Bilduebertragung ausfuehren.
-- NOCH NICHT AUSGEFUEHRT. NUR im V3-Zielprojekt tulndunkpsynkbbebenf.
-- Voraussetzung: 53 aktive Produktbilder wurden aus V2 kopiert und SHA-256-verifiziert.
-- Aendert nur imageUrl und updated_at von 53 aktiven V3-Produkten; keine V2-Aenderung.

DO $$
DECLARE
  v_expected integer;
  v_objects integer;
  v_updated integer;
BEGIN
  SELECT count(*) INTO v_expected
  FROM public.pos_catalog_items
  WHERE kind='product' AND deleted=false
    AND data->>'imageUrl' LIKE 'https://fsztsmnxbffanyfbytnr.supabase.co/storage/v1/object/public/article-images/%';
  IF v_expected <> 53 THEN
    RAISE EXCEPTION 'Abbruch: erwartet 53 aktive V2-Bildreferenzen, gefunden %.', v_expected;
  END IF;

  SELECT count(DISTINCT obj.name) INTO v_objects
  FROM public.pos_catalog_items p
  JOIN storage.objects obj
    ON obj.bucket_id='article-images'
   AND obj.name=split_part(split_part(p.data->>'imageUrl','/article-images/',2),'?',1)
  WHERE p.kind='product' AND p.deleted=false;
  IF v_objects <> 53 THEN
    RAISE EXCEPTION 'Abbruch: nur % von 53 Zielbildern gefunden. Erst Bilder uebertragen.', v_objects;
  END IF;

  UPDATE public.pos_catalog_items
  SET data=jsonb_set(
      data,'{imageUrl}',
      to_jsonb(replace(data->>'imageUrl',
        'https://fsztsmnxbffanyfbytnr.supabase.co/storage/v1/object/public/article-images/',
        'https://tulndunkpsynkbbebenf.supabase.co/storage/v1/object/public/article-images/')),
      true),
      updated_at=greatest(updated_at+1,floor(extract(epoch FROM clock_timestamp())*1000)::bigint),
      synced_at=now()
  WHERE kind='product' AND deleted=false
    AND data->>'imageUrl' LIKE 'https://fsztsmnxbffanyfbytnr.supabase.co/storage/v1/object/public/article-images/%';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 53 THEN
    RAISE EXCEPTION 'Abbruch: nur % von 53 Bildreferenzen geaendert.', v_updated;
  END IF;
END;
$$;
