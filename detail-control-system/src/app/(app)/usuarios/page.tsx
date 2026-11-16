import { FormNuevoUsuario } from '@/components/FormUsuario';
import { formatFechaHora } from '@/lib/formato';
import { crearClienteServidor } from '@/lib/supabase/servidor';

/** Usuarios de la organización. Todos operan de forma indistinta (RF-23). */
export default async function Usuarios() {
  const { data, error } = await crearClienteServidor().from('miembro').select('usuario_id, nombre, creado_en').order('creado_en');
  if (error) throw new Error(`No se pudo consultar la base de datos: ${error.message}`);

  return (
    <>
      <h1>Usuarios</h1>
      <p className="suave">No hay registro público: cada usuario lo da de alta alguien que ya tiene acceso.</p>
      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>Nuevo usuario</h2>
          <FormNuevoUsuario />
        </section>
        <section className="tarjeta">
          <h2>Usuarios con acceso</h2>
          <ul className="lista">
            {(data ?? []).map((m) => (
              <li key={m.usuario_id as string}>
                <strong>{m.nombre as string}</strong>
                <p className="suave">Alta: {formatFechaHora(m.creado_en as string)}</p>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </>
  );
}
