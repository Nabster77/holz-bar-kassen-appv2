import { supabase } from '@/lib/supabaseClient';
import { knownBookingReset } from '@/lib/bookingReset';
import type { CashSession } from '@/types';
import { assertFinalizedCloseMatches } from '@/lib/finalCloseVerification';

/**
 * Finalization only succeeds when Supabase accepts and RETURNS the complete
 * closed session. The numbered-receipt RPC by itself is NOT a saved close.
 */
export async function persistFinalizedCashSession(session: CashSession): Promise<void> {
  if (!supabase || !navigator.onLine) throw new Error('Cloud nicht verfügbar: Tagesabschluss nicht bestätigt.');
  if (!session.closed || !session.dailyCloseSnapshot || !session.dailyCloseReceiptNumber ||
      session.dailyCloseFinalizedAt == null) throw new Error('Unvollständiger Tagesabschluss.');
  const generation = knownBookingReset().generation;
  const row = { id: session.id, booking_generation: generation, location: session.location,
    date: session.date, data: session };
  const { error } = await supabase.from('pos_cash_sessions').upsert(row, { onConflict: 'id' });
  if (error) throw new Error(`Tagesabschluss nicht in Supabase gespeichert: ${error.message}`);

  const { data, error: readError } = await supabase.from('pos_cash_sessions')
    .select('id, booking_generation, data').eq('id', session.id)
    .eq('booking_generation', generation).maybeSingle();
  if (readError || !data) throw new Error('Tagesabschluss wurde von der Cloud nicht bestätigt.');
  assertFinalizedCloseMatches(session, data.data);
}
