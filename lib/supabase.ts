import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class ConfiguracionFaltanteError extends Error {}

/**
 * Cliente de Supabase para uso exclusivo en el servidor (Server Components y
 * Server Actions). Las credenciales nunca llegan al navegador.
 */
export function getSupabase(): SupabaseClient {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new ConfiguracionFaltanteError(
      'Faltan las variables SUPABASE_URL y/o SUPABASE_ANON_KEY. Copie .env.example como .env.local y complételo (ver README).',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
