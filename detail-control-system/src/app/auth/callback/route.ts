import { NextResponse, type NextRequest } from 'next/server';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

/*
 * Vuelta desde Supabase Auth: inicio con Google y enlace de recuperación de
 * contraseña. Canjea el código de un solo uso (PKCE) por una sesión y sigue
 * hacia `next` (solo rutas internas).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const siguiente = destinoInterno(url.searchParams.get('next'));
  const esRecuperacion = siguiente === '/restablecer';
  const codigo = url.searchParams.get('code');

  const fallar = () =>
    NextResponse.redirect(new URL(`/login?error=${esRecuperacion ? 'enlace' : 'google'}`, url.origin));

  if (!codigo) return fallar();

  const { data, error } = await crearClienteServidor().auth.exchangeCodeForSession(codigo);
  if (error || !data.user) return fallar();

  // Si es la primera cuenta del sistema (por ejemplo, creada con Google),
  // entra como administradora. En cualquier otro caso no hace nada.
  try {
    await crearClienteAdmin().rpc('activar_primera_cuenta', { p_usuario_id: data.user.id });
  } catch {
    // Sin clave de servicio la cuenta queda pendiente, que es lo seguro.
  }

  return NextResponse.redirect(new URL(siguiente, url.origin));
}

function destinoInterno(destino: string | null): string {
  return destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
}
