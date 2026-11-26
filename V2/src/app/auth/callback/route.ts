import { NextResponse, type NextRequest } from 'next/server';
import { crearClienteServidor } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

/*
 * Vuelta desde el enlace de recuperación de contraseña que envía Supabase
 * Auth. Canjea el código de un solo uso (PKCE) por una sesión y sigue hacia
 * `next` (solo rutas internas).
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const siguiente = destinoInterno(url.searchParams.get('next'));
  const codigo = url.searchParams.get('code');

  const fallar = () => NextResponse.redirect(new URL('/login?error=enlace', url.origin));

  if (!codigo) return fallar();

  const { data, error } = await crearClienteServidor().auth.exchangeCodeForSession(codigo);
  if (error || !data.user) return fallar();

  return NextResponse.redirect(new URL(siguiente, url.origin));
}

function destinoInterno(destino: string | null): string {
  return destino && destino.startsWith('/') && !destino.startsWith('//') ? destino : '/';
}
