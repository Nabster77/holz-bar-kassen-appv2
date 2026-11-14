/** WOODMO V3: online reset requires current manager or active administrator password. */
import { createClient } from 'npm:@supabase/supabase-js@2.57.4';
import { authorizedResetPassword, type AdministratorRecord } from './authorizePassword.ts';

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
    } catch { /* No usable key. */ }
  }
  return Deno.env.get(fallback) ?? '';
}
Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: HEADERS });
  if (request.method !== 'POST') return reply(405, { error: 'Nur POST erlaubt.' });
  const token = /^Bearer (.+)$/i.exec(request.headers.get('Authorization') ?? '')?.[1];
  if (!token || token.startsWith('sb_')) return reply(401, { error: 'Cloud-Anmeldung erforderlich.' });
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const publishableKey = namedKey('SUPABASE_PUBLISHABLE_KEYS', 'SUPABASE_ANON_KEY');
  const serviceKey = namedKey('SUPABASE_SECRET_KEYS', 'SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !publishableKey || !serviceKey) return reply(503, { error: 'Reset-Dienst nicht eingerichtet.' });

  let password: unknown;
  try {
    if (Number(request.headers.get('content-length') ?? '0') > 4096) return reply(413, { error: 'Anfrage zu groß.' });
    const raw = await request.text();
    if (raw.length > 4096) return reply(413, { error: 'Anfrage zu groß.' });
    const body: unknown = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) return reply(400, { error: 'Ungültige Anfrage.' });
    password = (body as { password?: unknown }).password;
  } catch { return reply(400, { error: 'Ungültige Anfrage.' }); }
  if (typeof password !== 'string' || !password.trim() || password.length > 256) {
    return reply(400, { error: 'Administrator- oder Verwaltungspasswort erforderlich.' });
  }

  // The shared cloud login is not itself the personal administrator proof.
  const account = createClient(url, publishableKey, {
    global: { headers: { Authorization: 'Bearer ' + token } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: login, error: loginError } = await account.auth.getUser(token);
  if (loginError || !login.user || login.user.email?.toLowerCase() !== 'admin@kasse.local') {
    return reply(403, { error: 'Cloud-Konto für Kassen-Reset nicht berechtigt.' });
  }
  const { data: managerValid, error: managerError } = await account.rpc('verify_admin_gate_password', {
    p_password: password,
  });
  if (managerError || typeof managerValid !== 'boolean') {
    return reply(503, { error: 'Aktuelles Verwaltungspasswort nicht prüfbar.' });
  }

  const service = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admins: AdministratorRecord[] = [];
  if (!managerValid) {
    for (let from = 0; from < 1000; from += 100) {
      const { data: rows, error: staffError } = await service.from('pos_staff_users')
        .select('data').eq('deleted', false)
        .eq('data->>role', 'administrator').eq('data->>active', 'true')
        .range(from, from + 99);
      if (staffError || !rows) return reply(503, { error: 'Administratorprüfung derzeit nicht möglich.' });
      for (const row of rows) admins.push(row.data as AdministratorRecord);
      if (rows.length < 100) break;
      if (from === 900) return reply(503, { error: 'Administratorverzeichnis zu groß.' });
    }
  }
  if (!(await authorizedResetPassword(password, managerValid, admins))) {
    return reply(403, { error: 'Administrator- oder Verwaltungspasswort nicht korrekt.' });
  }
  // The SQL RPC locks the generation and rechecks all unfinished sessions.
  const { data: reset, error: resetError } = await service.rpc('reset_pos_bookings_v3_authorized');
  if (resetError) return reply(409, { error: resetError.message || 'Cloud-Reset nicht bestätigt.' });
  if (!reset || typeof reset !== 'object' || Array.isArray(reset) ||
      !Number.isInteger(Number((reset as { generation?: unknown }).generation)) ||
      !Number.isFinite(Number((reset as { reset_at?: unknown }).reset_at))) {
    return reply(503, { error: 'Cloud-Reset nicht eindeutig bestätigt. Kassenstand prüfen.' });
  }
  return reply(200, reset as Record<string, unknown>);
});
