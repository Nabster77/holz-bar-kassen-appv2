import { supabase } from './supabaseClient';
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

export async function loadCloudStornos(): Promise<StornoRecord[]> {
  if (!supabase || !navigator.onLine) throw new Error('Stornojournal benötigt eine Cloud-Verbindung.');
  const { data, error } = await supabase.from('pos_stornos')
    .select('id,original_transaction_id,cash_session_id,location,recorded_at,employee_id,employee_name,reason,payment_method,gross_amount_cents,cash_effect_cents,card_effect_cents,original_receipt_snapshot')
    .order('recorded_at', { ascending: true });
  if (error) throw new Error(`Stornojournal konnte nicht geladen werden: ${error.message}`);
  return ((data ?? []) as CloudStornoRow[]).map(decodeStornoRow);
}

export async function submitStornoOnline(input: SubmitStorno): Promise<StornoRecord> {
  if (!supabase || !navigator.onLine) throw new Error('Ein Storno ist nur bei aktiver Cloud-Verbindung möglich.');
  if (!input.employeePassword) throw new Error('Bitte das persönliche Mitarbeiterpasswort bestätigen.');
  // Does not touch original transactions, sessions, staff, local backups,
  // or other cloud rows. The server decides the reversal and business rules.
  const { data, error } = await supabase.functions.invoke('woodmo-v3-storno', { body: input });
  if (error) throw new Error(`Storno nicht bestätigt: ${error.message}`);
  if (!data || typeof data !== 'object') throw new Error('Storno nicht bestätigt: Cloud-Antwort fehlt.');
  const storno = data as Partial<StornoRecord>;
  if (storno.id !== input.stornoId ||
      storno.originalTransactionId !== input.originalTransactionId ||
      storno.cashSessionId !== input.cashSessionId ||
      storno.employeeId !== input.employeeId ||
      !storno.originalSnapshot ||
      storno.originalSnapshot.id !== input.originalTransactionId ||
      typeof storno.reason !== 'string') {
    throw new Error('Storno nicht bestätigt: widersprüchliche Cloud-Antwort. Bitte Journal prüfen.');
  }
  return storno as StornoRecord;
}
