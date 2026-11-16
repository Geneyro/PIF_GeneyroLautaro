'use client';

import { useFormState, useFormStatus } from 'react-dom';
import { resolverSolicitud } from '@/app/acciones';
import { ROLES } from '@/lib/cuentas';
import type { RolUsuario } from '@/lib/tipos';
import { Aviso } from './ui';

/** Aprobar (con el rol elegido) o rechazar una solicitud de acceso. */
export function FormSolicitud({ usuarioId, rolSolicitado }: { usuarioId: string; rolSolicitado: RolUsuario }) {
  const [estado, accion] = useFormState(resolverSolicitud, null);
  if (estado?.ok) return <Aviso estado={estado} />;

  return (
    <form action={accion} className="form-linea">
      <input type="hidden" name="usuario_id" value={usuarioId} />
      <label className="campo campo-rol">
        <span>Rol</span>
        <select name="rol" defaultValue={rolSolicitado}>
          {ROLES.map((r) => (
            <option key={r.valor} value={r.valor}>
              {r.texto}
            </option>
          ))}
        </select>
      </label>
      <Decision valor="aprobar">Aprobar</Decision>
      <Decision valor="rechazar" secundario>
        Rechazar
      </Decision>
      <Aviso estado={estado} />
    </form>
  );
}

function Decision({ valor, secundario = false, children }: { valor: string; secundario?: boolean; children: React.ReactNode }) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name="decision"
      value={valor}
      className={secundario ? 'boton boton-secundario' : 'boton'}
      disabled={pending}
    >
      {children}
    </button>
  );
}
