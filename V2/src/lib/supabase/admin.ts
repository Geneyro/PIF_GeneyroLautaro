import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Cliente de administración (clave de servicio). SOLO servidor: este módulo
 * no puede importarse desde código de cliente (`server-only`) y la variable no
 * lleva el prefijo NEXT_PUBLIC_, así que nunca llega al navegador.
 *
 * Se usa únicamente para dar de alta usuarios. Todo lo demás corre con la
 * sesión del usuario y las reglas de la base.
 */
export function crearClienteAdmin(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !clave) {
    throw new Error('Falta la variable SUPABASE_SERVICE_ROLE_KEY en el servidor. Ver el README.');
  }
  return createClient(url, clave, { auth: { persistSession: false, autoRefreshToken: false } });
}
