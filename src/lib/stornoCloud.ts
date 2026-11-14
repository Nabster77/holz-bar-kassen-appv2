import { supabase } from './supabaseClient';
import { knownBookingReset } from './bookingReset';
import type { StornoRecord } from './stornoRules';
import { decodeStornoRow, type CloudStornoRow } from './stornoCodec';

/**
 * Stornos are NEVER added to the local generic offline outbox.
 * They require an online staff-password challenge and an atomic server
 * transaction. Do not call this unless the sale/session outbox was flushed.
 */
export interface SubmitStorno {
  /** Stable UUID for retries: never generate a fresh ID after a timeout. */
  stornoId: string;
  originalTransactionId: string;
  cashSessionId: string;
  employeeId: string;
  employeePassword: string;
  reason: string;
}

/** No productive Storno button before both the Edge service and the
 * protected ledger are reachable with the currently signed-in Cloud user.
 * A missing function, 401, 404, or unexpected payload all fail closed.
 */
export async function verifyStornoService(): Promise<void> {
  if (!supabase || !navigator.onLine) throw new Error('Storno-Dienst benötigt eine Cloud-Verbindung.');
  const { data, error } = await supabase.functions.invoke('woodmo-v3-storno', {
    body: { action: 'health' },
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data) ||
      (data as { ready?: unknown; version?: unknown }).ready !== true ||
      (data as { version?: unknown }).version !== 'woodmo-v3-storno-health-1') {
    throw new Error('Storno-Serverdienst nicht verfügbar oder nicht freigegeben. Bis zur Einrichtung nur Test-Storno im Testmodus.');
  }
}

export async function loadCloudStornos(generation = knownBookingReset().generation): Promise<StornoRecord[]> {
  if (!supabase || !navigator.onLine) throw new Error('Stornojournal benötigt eine Cloud-Verbindung.');
  const result: StornoRecord[] = [];
  // Supabase returns at most 1000 rows by default. Storno evidence must never
  // disappear after a busy season: page until the last record is returned.
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await supabase.from('pos_stornos')
      .select('id,original_transaction_id,cash_session_id,location,recorded_at,employee_id,employee_name,reason,payment_method,gross_amount_cents,cash_effect_cents,card_effect_cents,original_receipt_snapshot')
      .eq('booking_generation', generation)
      .order('recorded_at', { ascending: true })
      .order('id', { ascending: true })
      .range(offset, offset + 499);
    if (error) throw new Error(`Stornojournal konnte nicht geladen werden: ${error.message}`);
    for (const row of (data ?? []) as CloudStornoRow[]) result.push(decodeStornoRow(row));
    if ((data?.length ?? 0) < 500) break;
  }
  return result;
}

export async function submitStornoOnline(input: SubmitStorno): Promise<StornoRecord> {
  if (!supabase || !navigator.onLine) throw new Error('Ein Storno ist nur bei aktiver Cloud-Verbindung möglich.');
  if (!input.employeePassword) throw new Error('Bitte das persönliche Mitarbeiterpasswort bestätigen.');
  // Does not touch original transactions, sessions, staff, local backups,
  // or other cloud rows. The server decides the reversal and business rules.
  const { data, error } = await supabase.functions.invoke('woodmo-v3-storno', { body: input });
  if (error) throw new Error(`Storno nicht bestätigt: ${error.message}`);
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('Storno nicht bestätigt: Cloud-Antwort fehlt.');
  }
  // Same decoder for a newly created storno and later journal retrieval:
  // cash/card effects, original snapshot, reason and amounts must all agree.
  const storno = decodeStornoRow(data as CloudStornoRow);
  if (storno.id !== input.stornoId ||
      storno.originalTransactionId !== input.originalTransactionId ||
      storno.cashSessionId !== input.cashSessionId ||
      storno.employeeId !== input.employeeId) {
    throw new Error('Storno nicht bestätigt: widersprüchliche Cloud-Antwort. Bitte Journal prüfen.');
  }
  return storno;
}
