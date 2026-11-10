-- PREPARED ONLY. Run in an isolated test project first; production requires approval.
-- No new tables and no writes to booking/session/staff data.
CREATE OR REPLACE FUNCTION public.import_pos_catalog(p_expected jsonb, p_rows jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  current_rows jsonb;
  expected_rows jsonb;
  revision bigint;
BEGIN
  -- Same account boundary as existing catalog RLS. No anonymous execution.
  IF auth.uid() IS DISTINCT FROM '8461bbe1-9c6f-46c4-be41-dcbcc69f8be4'::uuid THEN
    RAISE EXCEPTION 'Nicht berechtigt.' USING ERRCODE = '42501';
  END IF;
  IF jsonb_typeof(p_expected) IS DISTINCT FROM 'array' OR jsonb_typeof(p_rows) IS DISTINCT FROM 'array'
     OR jsonb_array_length(p_rows) > 20000 THEN
    RAISE EXCEPTION 'Ungültiger Import.';
  END IF;
  -- Blocks concurrent INSERT/UPDATE, including the ordinary catalog sync, until commit.
  LOCK TABLE public.pos_catalog_items IN SHARE ROW EXCLUSIVE MODE;
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'data',data,
      'updated_at',updated_at,'deleted',deleted) ORDER BY kind,id),'[]'::jsonb)
    INTO current_rows FROM public.pos_catalog_items;
  SELECT coalesce(jsonb_agg(value ORDER BY value->>'kind',value->>'id'),'[]'::jsonb)
    INTO expected_rows FROM jsonb_array_elements(p_expected);
  IF current_rows IS DISTINCT FROM expected_rows THEN
    RAISE EXCEPTION 'Katalog wurde seit der Vorschau geändert. Bitte Vorschau neu erstellen.' USING ERRCODE = '40001';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r
     WHERE r->>'kind' IS NULL OR r->>'kind' NOT IN ('product','category','setting')
       OR coalesce(r->>'id','') = '' OR r->'deleted' IS DISTINCT FROM 'false'::jsonb
       OR (r->>'kind' = 'setting' AND r->>'id' NOT IN ('pfand','schuss-options'))
       OR (r->>'kind' IN ('product','category') AND jsonb_typeof(r->'data') IS DISTINCT FROM 'object')
       OR (r->>'kind' = 'product' AND r->'data'->>'categoryId' = 'cat-system-schuss'))
     OR EXISTS (SELECT 1 FROM jsonb_array_elements(p_rows) r GROUP BY r->>'kind',r->>'id' HAVING count(*)>1)
  THEN RAISE EXCEPTION 'Ungültige oder doppelte Katalogeinträge.'; END IF;
  SELECT greatest(floor(extract(epoch FROM clock_timestamp())*1000)::bigint,
    coalesce(max(updated_at),0)+1) INTO revision FROM public.pos_catalog_items;
  INSERT INTO public.pos_catalog_items(kind,id,data,updated_at,deleted)
    SELECT r->>'kind',r->>'id',r->'data',revision,false FROM jsonb_array_elements(p_rows) r
  ON CONFLICT(kind,id) DO UPDATE SET data=excluded.data,updated_at=excluded.updated_at,deleted=false;
  RETURN (SELECT coalesce(jsonb_agg(jsonb_build_object('kind',kind,'id',id,'data',data,
    'updated_at',updated_at,'deleted',deleted) ORDER BY kind,id),'[]'::jsonb) FROM public.pos_catalog_items);
END;
$$;
REVOKE ALL ON FUNCTION public.import_pos_catalog(jsonb,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.import_pos_catalog(jsonb,jsonb) TO authenticated;
