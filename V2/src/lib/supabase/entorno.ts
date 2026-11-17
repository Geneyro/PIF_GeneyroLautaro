/** Variables públicas de Supabase. Devuelve null si falta alguna. */
export function entornoSupabase(): { url: string; clave: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const clave = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && clave ? { url, clave } : null;
}

export const MENSAJE_SIN_ENTORNO =
  'Faltan las variables NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY. Ver el README.';
