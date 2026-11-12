import type { StornoRecord } from './stornoRules';
import type { Transaction } from '../types';

/** Pure decoder: remote financial records are untrusted until validated. */
export type CloudStornoRow = {
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
      typeof row.id !== 'string' || !row.id ||
      typeof row.cash_session_id !== 'string' || !row.cash_session_id ||
      typeof row.reason !== 'string' || row.reason.trim().length < 3 ||
      (row.location !== 'Friedrichshafen' && row.location !== 'Bregenz') ||
      (row.payment_method !== 'cash' && row.payment_method !== 'card') ||
      !Array.isArray(row.original_receipt_snapshot.items) ||
      !row.original_receipt_snapshot.taxByRate ||
      row.original_receipt_snapshot.id !== row.original_transaction_id ||
      row.original_receipt_snapshot.location !== row.location ||
      row.original_receipt_snapshot.paymentMethod !== row.payment_method ||
      !Number.isSafeInteger(row.gross_amount_cents) ||
      !Number.isSafeInteger(row.cash_effect_cents) ||
      !Number.isSafeInteger(row.card_effect_cents) ||
      Math.round(row.original_receipt_snapshot.total * 100) !== row.gross_amount_cents ||
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

