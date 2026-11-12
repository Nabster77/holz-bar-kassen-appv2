import { supabase } from './supabaseClient';
import type { StornoRecord } from './stornoRules';
import type { Transaction } from '../types';

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

type CloudStornoRow = {
  id: string;
  original_transaction_id: string;
  cash_session_id: string;
  location: StornoRecord['location'];
  recorded_at: string;
  employee_id: string;
  employee_name: string;
  reason: string;
  payment_method: StornoRecord['paymentMethod'];
  gross_amount_cents: number;
  cash_effect_cents: number;
  card_effect_cents: number;
  original_receipt_snapshot: Transaction;
};

export function decodeStornoRow(row: CloudStornoRow): StornoRecord {
  const timestamp = Date.parse(row.recorded_at);
  if (!Number.isFinite(timestamp) || !row.original_receipt_snapshot ||
      row.original_receipt_snapshot.id !== row.original_transaction_id ||
      row.original_receipt_snapshot.location !== row.location ||
      row.original_receipt_snapshot.paymentMethod !== row.payment_method ||
      !Number.isSafeInteger(row.gross_amount_cents) ||
      !Number.isSafeInteger(row.cash_effect_cents) ||
      !Number.isSafeInteger(row.card_effect_cents) ||
      ((row.payment_method === 'cash')
        ? row.cash_effect_cents !== -row.gross_amount_cents || row.card_effect_cents !== 0
        : row.card_effect_cents !== -row.gross_amount_cents || row.cash_effect_cents !== 0)) {
    throw new Error('Stornodatensatz der Cloud ist unvollständig oder widersprüchlich.');
  }
  return {
    id: row.id,
    originalTransactionId: row.original_transaction_id,
    cashSessionId: row.cash_session_id,
    location: row.location,
    timestamp,
    employeeId: row.employee_id,
    employeeName: row.employee_name,
    reason: row.reason,
    paymentMethod: row.payment_method,
    grossAmount: row.gross_amount_cents / 100,
    cashEffect: row.cash_effect_cents / 100,
    cardEffect: row.card_effect_cents / 100,
    originalSnapshot: row.original_receipt_snapshot,
  };
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
