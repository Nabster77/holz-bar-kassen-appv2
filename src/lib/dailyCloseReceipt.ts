import { supabase } from '@/lib/supabaseClient';
import type { Location } from '@/types';
import { businessCloseDate, formatDailyCloseNumber } from '@/lib/dailyCloseNumbering';

export interface DailyCloseReceipt {
  number: number;
  location: Location;
  year: number;
}

/**
 * Requests the permanent, cloud-wide receipt number for a finalized cash
 * session. The database returns the existing number when this was already
 * requested on another device, so a receipt can never receive two numbers.
 */
export async function issueDailyCloseReceipt(sessionId: string, staffName: string, location: Location, closedAt: number): Promise<DailyCloseReceipt> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  if (!navigator.onLine) throw new Error('Beleg konnte nicht erstellt werden, da keine Internetverbindung besteht. Bitte Internetverbindung prüfen und erneut versuchen.');

  const localDate = businessCloseDate(closedAt);
  const { data, error } = await supabase.rpc('issue_pos_daily_close_receipt', {
    p_session_id: sessionId,
    p_staff_name: staffName,
    p_location: location,
    p_close_date: localDate,
  });
  if (error) throw error;
  const value = data as Partial<DailyCloseReceipt> | null;
  if (!value || !Number.isSafeInteger(Number(value.number)) || Number(value.number) < 1 ||
      (value.location !== 'Friedrichshafen' && value.location !== 'Bregenz') || !Number.isSafeInteger(Number(value.year))) {
    throw new Error('Die Cloud hat keine gültige Belegnummer zurückgegeben.');
  }
  if (value.location !== location || Number(value.year) !== Number(localDate.slice(0, 4))) {
    throw new Error('Die Cloud-Belegnummer gehört zum falschen Standort oder Kalenderjahr.');
  }
  return { number: Number(value.number), location: value.location, year: Number(value.year) };
}

export function formatDailyCloseReceiptNumber(number: number | undefined, location: Location, timestamp: number, storedYear?: number): string | null {
  return formatDailyCloseNumber(number, location, timestamp, storedYear);
}
