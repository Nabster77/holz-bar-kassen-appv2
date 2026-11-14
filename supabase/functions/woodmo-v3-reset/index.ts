/**
 * WOODMO V3: freshly verify an active administrator's personal password
 * OR the current shared management password before atomic cloud reset.
 * Never accept client-provided role claims or password hashes.
 */
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { verifyExistingStaffPassword } from './passwordProof.ts';

const HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Cache-Control': 'no-store',
};
function reply(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...HEADERS, 'Content-Type': 'application/json; charset=utf-8' },
  });
}
function namedKey(name: string, fallback: string): string {
  const raw = Deno.env.get(name);
  if (raw) {
    try {
      const keys = JSON.parse(raw) as Record<string, string>;
      if (typeof keys.default === 'string' && keys.default) return keys.default;
    } catch { /* Missing key is handled below. */ }
  }
  return Deno.env.get(fallback) ?? '';
}
Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return reply(405, { error: 'Nur POST ist erlaubt.' });
  const token = /^Bearer (.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token || token.startsWith('sb_')) return reply(401, { error: 'Cloud-Anmeldung erforderlich.' });

  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const publicKey = namedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  const secretKey = namedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publicKey || !secretKey) {
    return reply(503, { error: 'Reset-Dienst noch nicht eingerichtet.' });
  }

  let password: unknown;
  try {
    if (Number(request.headers.get('content-length') ?? '0') > 4096) {
      return reply(413, { error: 'Reset-Anfrage zu groß.' });
    }
    const raw = await request.text();
    if (raw.length > 4096) return reply(413, { error: 'Reset-Anfrage zu groß.' });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return reply(400, { error: 'Ungültige Reset-Anfrage.' });
    }
    password = (body as { password?: unknown }).password;
  } catch {
    return reply(400, { error: 'Ungültige Reset-Anfrage.' });
  }
  if (typeof password !== 'string' || !password.trim() || password.length > 256) {
    return reply(400, { error: 'Administrator- oder Verwaltungspasswort fehlt oder ist ungültig.' });
  }

  const account = createClient(url, publicKey, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await account.auth.getUser(token);
  if (userError || !userData.user || userData.user.email?.toLowerCase() !== 'admin@kasse.local') {
    return reply(403, { error: 'Cloud-Konto für den Kassen-Reset nicht berechtigt.' });
  }
  const service = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: managerValid, error: managerError } = await account
    .rpc('verify_admin_gate_password', { p_password: password });
  if (managerError || typeof managerValid !== 'boolean') {
    return reply(503, { error: 'Cloud-Verwaltungspasswort momentan nicht prüfbar.' });
  }
  let authorized = managerValid;
  if (!authorized) {
    // Fail closed if staff directory can't be read in full.
    const { data: rows, error: staffError } = await service
      .from('pos_staff_users').select('id, data, deleted').eq('deleted', false).limit(101);
    if (staffError || !rows || rows.length > 100) {
      return reply(503, { error: 'Administratorprüfung derzeit nicht möglich.' });
    }
    for (const row of rows) {
      const staff = row.data as {
        role?: unknown; active?: unknown;
        passwordSalt?: string | null; passwordHash?: string | null;
      } | null;
      if (!staff || staff.role !== 'administrator' || staff.active !== true || row.deleted) continue;
      if (await verifyExistingStaffPassword(
        password, staff.passwordSalt ?? null, staff.passwordHash ?? null,
      )) { authorized = true; break; }
    }
  }
  if (!authorized) {
    return reply(403, { error: 'Administrator- oder Verwaltungspasswort nicht korrekt.' });
  }
  // The database repeats open-register checks under a serializing lock.
  const { data: reset, error: resetError } = await service
    .rpc('reset_pos_bookings_v3_authorized');
  if (resetError) return reply(409, {
    error: resetError.message || 'Reset gesperrt. Bitte Kassenstatus prüfen.',
  });
  if (!reset || typeof reset !== 'object' || Array.isArray(reset) ||
      !Number.isInteger(Number((reset as { generation?: unknown }).generation)) ||
      !Number.isFinite(Number((reset as { reset_at?: unknown }).reset_at))) {
    return reply(503, { error: 'Reset nicht eindeutig bestätigt. Cloud-Kassenstand prüfen.' });
  }
  return reply(200, reset as Record<string, unknown>);
});
