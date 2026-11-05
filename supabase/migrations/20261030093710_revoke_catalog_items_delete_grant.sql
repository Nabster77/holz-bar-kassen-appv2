/*
# Revoke unused DELETE grant on catalog items

1. Modified table
- `pos_catalog_items`: the authenticated role no longer holds DELETE.

2. Security
- Catalog rows are never deleted; removals are stored as tombstones (deleted = true).
- No data is changed or removed by this migration.
*/

REVOKE DELETE ON public.pos_catalog_items FROM authenticated;
