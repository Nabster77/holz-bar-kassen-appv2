import { supabase } from '@/lib/supabaseClient';
import type { CashSession, Transaction } from '@/types';

const PAGE_SIZE = 1000;
// Transactions are compared by timestamp; a small overlap guards against
// rows that were uploaded late with an older timestamp.
const CURSOR_OVERLAP_MS = 60_000;

export interface CloudData {
  generation: number;
  transactions: Transaction[];
  cashSessions: CashSession[];
  newestTransactionTimestamp: number | null;
}

function isRecord<T extends { id: string }>(value: unknown): value is T {
  return typeof value === 'object' && value !== null && typeof (value as { id?: unknown }).id === 'string';
}

async function fetchTransactions(sinceTimestamp: number | null, generation: number): Promise<Transaction[]> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const rows: Transaction[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    let query = supabase.from('pos_transactions').select('data').eq('booking_generation', generation).order('id').range(from, from + PAGE_SIZE - 1);
    if (sinceTimestamp !== null) query = query.gte('timestamp', sinceTimestamp - CURSOR_OVERLAP_MS);
    const { data, error } = await query;
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page.map((r) => r.data).filter(isRecord<Transaction>));
    if (page.length < PAGE_SIZE) return rows;
  }
}

async function fetchCashSessions(generation: number): Promise<CashSession[]> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const rows: CashSession[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('pos_cash_sessions')
      .select('data')
      .eq('booking_generation', generation)
      .order('id')
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const page = data ?? [];
    rows.push(...page.map((r) => r.data).filter(isRecord<CashSession>));
    if (page.length < PAGE_SIZE) return rows;
  }
}

// Fetches sales newer than the given timestamp (or all when null) and every cash session.
export async function fetchCloudData(sinceTimestamp: number | null, generation: number): Promise<CloudData> {
  const [transactions, cashSessions] = await Promise.all([
    fetchTransactions(sinceTimestamp, generation),
    fetchCashSessions(generation),
  ]);
  const newestTransactionTimestamp = transactions.reduce<number | null>(
    (max, t) => (max === null || t.timestamp > max ? t.timestamp : max),
    null,
  );
  return { generation, transactions, cashSessions, newestTransactionTimestamp };
}
