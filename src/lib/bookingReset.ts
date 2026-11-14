import { supabase } from '@/lib/supabaseClient';
import { loadJSON, saveJSON, STORAGE_KEYS } from '@/lib/storage';

export interface BookingReset {
  resetAt: number;
  generation: number;
}

export function knownBookingReset(): BookingReset {
  const stored = loadJSON<BookingReset | number>(STORAGE_KEYS.bookingResetAt, { resetAt: 0, generation: 0 });
  // Older app versions stored only the timestamp. Treat it as generation zero.
  return typeof stored === 'number' ? { resetAt: stored, generation: 0 } : stored;
}

export function rememberBookingReset(reset: BookingReset): void {
  saveJSON(STORAGE_KEYS.bookingResetAt, reset);
}

// Opens a fresh V3 booking generation without deleting historic sales, sessions, or stornos.
// Stale offline clients are rejected by generation guards. The catalog and staff are untouched.
export async function resetCloudBookings(): Promise<BookingReset> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { data, error } = await supabase.rpc('reset_pos_bookings_v3');
  if (error) throw error;
  if (!data || typeof data !== 'object') throw new Error('Unerwartete Antwort der Cloud.');
  const resetAt = Number((data as { reset_at?: unknown }).reset_at);
  const generation = Number((data as { generation?: unknown }).generation);
  if (!Number.isFinite(resetAt) || !Number.isInteger(generation) || generation < 0) {
    throw new Error('Unerwartete Antwort der Cloud.');
  }
  return { resetAt, generation };
}

export async function fetchLatestBookingReset(): Promise<BookingReset | null> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { data, error } = await supabase
    .from('pos_booking_resets')
    .select('id, reset_at')
    .order('id', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const resetAt = Number(data.reset_at);
  const generation = Number(data.id);
  if (!Number.isFinite(resetAt) || !Number.isInteger(generation) || generation < 0) {
    throw new Error('Unerwartete Antwort der Cloud.');
  }
  return { resetAt, generation };
}
