/**
 * WOODMO V3 - audited storno gateway. Not yet deployed.
 * Requires Supabase user JWT + freshly re-entered personal staff password.
 * Database write is delegated to a service-role-only transactional RPC.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { verifyExistingStaffPassword } from './passwordProof.ts';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};

function reply(code: number, data: Record<string, unknown>): Response {
  return new Response(JSON.stringify(data), {
    status: code,
    headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i;

function namedKey(name: string, fallback: string): string {
  const raw = Deno.env.get(name);
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      if (typeof keys.default === 'string' && keys.default) return keys.default;
    } catch { /* Invalid secret configuration is detected below. */ }
  }
  return Deno.env.get(fallback) ?? '';
}

type StornoRequest = {
  stornoId?: unknown;
  originalTransactionId?: unknown;
  cashSessionId?: unknown;
  employeeId?: unknown;
  employeePassword?: unknown;
  reason?: unknown;
  action?: unknown;
};

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return reply(405, { error: 'Nur POST ist erlaubt.' });

  // Do not accept publishable/secret API keys alone as personal sessions.
  const token = /^Bearer (.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token || token.startsWith('sb_')) return reply(401, { error: 'Cloud-Anmeldung erforderlich.' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const publicKey = namedKey('SUPABASE_PUBLISHABLE_KEYS','SUPABASE_ANON_KEY');
  const secretKey = namedKey('SUPABASE_SECRET_KEYS','SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !secretKey) return reply(503, { error: 'Storno-Dienst noch nicht eingerichtet.' });

  let input: StornoRequest;
  try {
    if (Number(request.headers.get('content-length') ?? '0') > 4096) {
      return reply(413, { error: 'Stornoantrag zu groß.' });
    }
    const raw = await request.text();
    if (raw.length > 4096) return reply(413, { error: 'Stornoantrag zu groß.' });
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return reply(400, { error: 'Ungültiger Stornoantrag.' });
    }
    input = parsed as StornoRequest;
  } catch {
    return reply(400, { error: 'Ungültiger Stornoantrag.' });
  }

  if (input.action === 'health') {
    // The readiness handshake authenticates the real Supabase cloud account
    // and proves this precise Edge version can reach the protected ledger.
    // It never performs a sale, a storno or any business-data mutation.
    const account = createClient(url, publicKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: proof, error: authError } = await account.auth.getUser(token);
    if (authError || proof.user?.email?.toLowerCase() !== 'admin@kasse.local') {
      return reply(403, { error: 'Cloud-Konto für Storno nicht freigeschaltet.' });
    }
    const service = createClient(url, secretKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { error: probeError } = await service.from('pos_stornos')
      .select('id').limit(1);
    if (probeError) return reply(503, { error: 'Stornojournal nicht erreichbar.' });
    return reply(200, { ready: true, version: 'woodmo-v3-storno-health-1' });
  }

  const id = typeof input.stornoId === 'string' ? input.stornoId : '';
  const sessionId = typeof input.cashSessionId === 'string' ? input.cashSessionId : '';
  const receiptId = typeof input.originalTransactionId === 'string' ? input.originalTransactionId : '';
  const employeeId = typeof input.employeeId === 'string' ? input.employeeId : '';
  const password = typeof input.employeePassword === 'string' ? input.employeePassword : '';
  const reason = typeof input.reason === 'string' ? input.reason.trim() : '';
  if (!UUID.test(id) || !UUID.test(employeeId) ||
      !sessionId || sessionId.length > 128 ||
      !receiptId || receiptId.length > 128 ||
      reason.length < 3 || reason.length > 500 ||
      !password || password.length > 256) {
    return reply(400, { error: 'Storno-ID, Mitarbeiter, Originalbon, Grund oder Passwort ungültig.' });
  }

  // Supabase Auth checks the JWT against its server; client-side claims alone
  // (including user_metadata or a client-provided role) are never trusted.
  const auth = createClient(url, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: userData, error: userError } = await auth.auth.getUser(token);
  if (userError || !userData.user || userData.user.email?.toLowerCase() !== 'admin@kasse.local') {
    return reply(403, { error: 'Cloud-Konto für diese Kasse nicht berechtigt.' });
  }

  const db = createClient(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: staffRow, error: staffError } = await db
    .from('pos_staff_users').select('id, data, deleted').eq('id', employeeId).maybeSingle();

  if (staffError) return reply(503, { error: 'Mitarbeiterprüfung momentan nicht möglich.' });
  const staff = staffRow?.data as {
    active?: boolean; role?: unknown; passwordSalt?: string | null; passwordHash?: string | null;
  } | undefined;

  if (!staffRow || staffRow.deleted || !staff?.active ||
      (staff.role !== 'administrator' && staff.role !== 'employee') ||
      !(await verifyExistingStaffPassword(password, staff.passwordSalt ?? null, staff.passwordHash ?? null))) {
    return reply(403, { error: 'Mitarbeiter oder persönliches Passwort nicht bestätigt.' });
  }

  // The RPC must recheck current register state, latest five, cash coverage,
  // active employee and booking generation under DB locks before INSERT.
  const { data: storno, error: rpcError } = await db.rpc('create_pos_storno_v3', {
    p_storno_id: id,
    p_original_transaction_id: receiptId,
    p_cash_session_id: sessionId,
    p_staff_id: employeeId,
    p_reason: reason,
  });
  if (rpcError) {
    // Expected business-rule errors are safe to show; never expose credentials.
    return reply(409, { error: rpcError.message || 'Storno abgelehnt. Bitte Kasse synchronisieren.' });
  }
  if (!storno) return reply(503, { error: 'Stornobestätigung fehlt. Bitte Journal prüfen.' });

  return reply(200, {
    id: storno.id,
    original_transaction_id: storno.original_transaction_id,
    cash_session_id: storno.cash_session_id,
    location: storno.location,
    recorded_at: storno.recorded_at,
    reason: storno.reason,
    employee_id: storno.employee_id,
    employee_name: storno.employee_name,
    payment_method: storno.payment_method,
    gross_amount_cents: storno.gross_amount_cents,
    cash_effect_cents: storno.cash_effect_cents,
    card_effect_cents: storno.card_effect_cents,
    original_receipt_snapshot: storno.original_receipt_snapshot,
  });
});
