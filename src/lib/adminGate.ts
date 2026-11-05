import { supabase } from '@/lib/supabaseClient';

export async function verifyAdminPassword(input: string): Promise<boolean> {
  if (!supabase) throw new Error('Cloud ist nicht konfiguriert.');
  const { data, error } = await supabase.rpc('verify_admin_gate_password', { p_password: input });
  if (error) throw error;
  if (typeof data !== 'boolean') throw new Error('Unerwartete Antwort der Cloud.');
  return data;
}
