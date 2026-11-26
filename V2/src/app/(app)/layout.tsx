import { redirect } from 'next/navigation';
import { cerrarSesion } from '@/app/acciones';
import { MarcoAuth } from '@/components/MarcoAuth';
import { Encabezado, Menu } from '@/components/Menu';
import { textoRol } from '@/lib/cuentas';
import { contarAlertas, miembroActual } from '@/lib/datos';
import { usuarioActual } from '@/lib/supabase/servidor';

export const dynamic = 'force-dynamic';

/**
 * Marco de todas las pantallas de negocio. Además del middleware, vuelve a
 * exigir la sesión acá (RF-23). Una cuenta sin aprobar ve solo un aviso:
 * la base, de todos modos, no le devuelve ningún dato.
 */
export default async function MarcoAplicacion({ children }: { children: React.ReactNode }) {
  const usuario = await usuarioActual();
  if (!usuario) redirect('/login');
  const miembro = await miembroActual(usuario.id);

  if (!miembro) {
    return (
      <MarcoAuth titulo="Cuenta pendiente de aprobación">
        <p>
          Tu cuenta{usuario.email ? ` (${usuario.email})` : ''} está creada, pero todavía no tiene acceso. Un
          administrador debe aprobarla.
        </p>
        <p className="suave">Cuando la aprueben, vuelve a ingresar.</p>
        <form action={cerrarSesion}>
          <button type="submit" className="boton boton-secundario">
            Cerrar sesión
          </button>
        </form>
      </MarcoAuth>
    );
  }

  const alertas = await contarAlertas();

  return (
    <div className="app">
      <Menu nombre={miembro.nombre} rol={textoRol(miembro.rol)} alertas={alertas} />
      <div className="area">
        <Encabezado />
        <main className="contenido">{children}</main>
      </div>
    </div>
  );
}
