import { FormSolicitud } from '@/components/FormSolicitud';
import { textoRol } from '@/lib/cuentas';
import { cargarMiembros, cargarSolicitudes, miembroActual } from '@/lib/datos';
import { formatFechaHora } from '@/lib/formato';
import { usuarioActual } from '@/lib/supabase/servidor';

/** Usuarios con acceso y, para administradores, las cuentas que esperan aprobación. */
export default async function Usuarios() {
  const usuario = await usuarioActual();
  const yo = usuario ? await miembroActual(usuario.id) : null;
  const esAdministrador = yo?.rol === 'ADMINISTRADOR';
  const [miembros, solicitudes] = await Promise.all([
    cargarMiembros(),
    esAdministrador ? cargarSolicitudes() : Promise.resolve([]),
  ]);

  return (
    <>
      <h1>Usuarios</h1>
      <p className="suave">
        Las cuentas nuevas se crean desde «Regístrate» o con Google y quedan pendientes hasta que un administrador las
        aprueba.
      </p>

      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>Solicitudes de acceso</h2>
          {!esAdministrador ? (
            <p className="vacio">Solo un administrador puede ver y aprobar las solicitudes.</p>
          ) : solicitudes.length === 0 ? (
            <p className="vacio">No hay cuentas esperando aprobación.</p>
          ) : (
            <ul className="lista">
              {solicitudes.map((s) => (
                <li key={s.usuario_id}>
                  <strong>{s.nombre}</strong>
                  <p className="suave">
                    {s.correo ?? 'sin correo'} · pidió {textoRol(s.rol_solicitado)} · {formatFechaHora(s.creado_en)}
                  </p>
                  <FormSolicitud usuarioId={s.usuario_id} rolSolicitado={s.rol_solicitado} />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="tarjeta">
          <h2>Usuarios con acceso</h2>
          <ul className="lista">
            {miembros.map((m) => (
              <li key={m.usuario_id}>
                <strong>{m.nombre}</strong> <span className="etiqueta">{textoRol(m.rol)}</span>
                <p className="suave">Alta: {formatFechaHora(m.creado_en)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
