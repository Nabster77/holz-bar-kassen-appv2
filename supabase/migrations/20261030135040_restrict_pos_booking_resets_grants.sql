/*
# Restrict grants on pos_booking_resets

1. Changes
- Removes all table privileges that Supabase grants by default to anon and authenticated on the new pos_booking_resets table.
- Re-grants only SELECT to authenticated (the admin account reads the reset marker).

2. Security
- TRUNCATE is not controlled by row level security, so the default grant would have let the anon key or any signed-in user clear the reset marker.
- Writes happen only inside reset_pos_bookings(), which runs as the table owner.
- No data is changed; existing rows stay as they are.
*/

REVOKE ALL ON public.pos_booking_resets FROM anon, authenticated;
GRANT SELECT ON public.pos_booking_resets TO authenticated;
