import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export class ConfiguracionFaltanteError extends Error {}

/**
 * Cliente de Supabase para uso exclusivo en el servidor (Server Components y
 * Server Actions). Las credenciales nunca llegan al navegador.
 */
export function getSupabase(): SupabaseClient {
  // Se aceptan ambos nombres: SUPABASE_* (local) y NEXT_PUBLIC_SUPABASE_* (Vercel).
  // Este módulo es server-only, así que el valor no se incluye en el bundle del navegador.
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    throw new ConfiguracionFaltanteError(
      'Faltan las variables SUPABASE_URL / SUPABASE_ANON_KEY (o NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY). Ver README.',
    );
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
