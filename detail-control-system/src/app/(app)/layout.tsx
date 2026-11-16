import { redirect } from 'next/navigation';
import { cerrarSesion } from '@/app/acciones';
import { Navegacion } from '@/components/Navegacion';
import { nombreDelUsuario } from '@/lib/datos';
import { usuarioActual } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

/**
 * Marco de todas las pantallas de negocio. Además del middleware, vuelve a
 * exigir la sesión acá: sin usuario verificado no se renderiza nada (RF-23).
 */
export default async function MarcoAplicacion({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login');
  const nombre = (await nombreDelUsuario(usuario.id)) ?? usuario.email ?? 'Usuario';

  return (
    <>
      <header className="cabecera">
        <div className="cabecera-fila">
          <span className="marca">DETAIL CONTROL</span>
          <form action={cerrarSesion} className="sesion">
            <span className="suave">{nombre}</span>
            <button type="submit" className="boton boton-secundario boton-chico">
              Cerrar sesión
            </button>
          </form>
        </div>
        <Navegacion />
      </header>
      <main className="contenido">{children}</main>
    </>
  );
}
