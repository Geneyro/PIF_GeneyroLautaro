import { NextResponse, type NextRequest } from 'next/server';
import { createServerClient } from '@supabase/ssr';
import { entornoSupabase } from '@/lib/supabase/entorno';

/*
 * RF-23: ninguna pantalla ni acción es accesible sin sesión.
 * Toda petición pasa por acá: se verifica la sesión contra Supabase Auth y,
 * si no es válida, se redirige al inicio de sesión. Ante cualquier duda
 * (variables faltantes, error de red) se niega el acceso.
 */
export async function middleware(request: NextRequest) {
  const enLogin = request.nextUrl.pathname === '/login';
  let respuesta = NextResponse.next({ request });
  let haySesion = false;

  const entorno = entornoSupabase();
  if (entorno) {
    const supabase = createServerClient(entorno.url, entorno.clave, {
      cookies: {
        getAll: () => request.cookies.getAll(),
        setAll: (nuevas) => {
          for (const { name, value } of nuevas) request.cookies.set(name, value);
          respuesta = NextResponse.next({ request });
          for (const { name, value, options } of nuevas) respuesta.cookies.set(name, value, options);
        },
      },
    });
    try {
      const { data } = await supabase.auth.getUser();
      haySesion = data.user !== null;
    } catch {
      haySesion = false;
    }
  }

  if (!haySesion && !enLogin) {
    return redirigir(request, '/login', respuesta);
  }
  if (haySesion && enLogin) {
    return redirigir(request, '/', respuesta);
  }
  return respuesta;
}

/** Redirige conservando las cookies de sesión renovadas. */
function redirigir(request: NextRequest, destino: string, origen: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = destino;
  url.search = '';
  const redireccion = NextResponse.redirect(url);
  for (const cookie of origen.cookies.getAll()) redireccion.cookies.set(cookie);
  return redireccion;
}

export const config = {
  // Todo, salvo los archivos estáticos de Next.js.
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
