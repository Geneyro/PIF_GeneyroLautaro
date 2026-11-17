import 'server-only';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { MENSAJE_SIN_ENTORNO, entornoSupabase } from './entorno';

/**
 * Cliente de Supabase para Server Components y Server Actions.
 *
 * Usa la clave pública junto con la sesión del usuario (cookies): cada consulta
 * llega a la base con la identidad de quien inició sesión, y son las políticas
 * y funciones de la base las que deciden qué puede ver y hacer.
 * La clave service_role no se usa en la aplicación.
 */
export function crearClienteServidor() {
  const entorno = entornoSupabase();
  if (!entorno) throw new Error(MENSAJE_SIN_ENTORNO);

  const almacen = cookies();
  return createServerClient(entorno.url, entorno.clave, {
    cookies: {
      getAll: () => almacen.getAll(),
      setAll: (nuevas) => {
        try {
          for (const { name, value, options } of nuevas) almacen.set(name, value, options);
        } catch {
          // Desde un Server Component no se pueden escribir cookies; el
          // middleware se encarga de renovar la sesión en cada petición.
        }
      },
    },
  });
}

/** Usuario de la sesión, verificado contra Supabase Auth. Null si no hay sesión. */
export async function usuarioActual() {
  const supabase = crearClienteServidor();
  const { data } = await supabase.auth.getUser();
  return data.user ?? null;
}
