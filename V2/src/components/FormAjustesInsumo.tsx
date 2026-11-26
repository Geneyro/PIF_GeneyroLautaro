'use client';

import { useFormState } from 'react-dom';
import { cambiarEstadoInsumo, definirPuntoPedido } from '@/app/acciones';
import type { UnidadBase } from '@/lib/tipos';
import { Aviso, Enviar } from './ui';

/** Punto de pedido del insumo, en unidad base. Vacío: sin alerta. */
export function FormPuntoPedido({
  insumoId,
  unidadBase,
  actual,
}: {
  insumoId: string;
  unidadBase: UnidadBase;
  actual: number | null;
}) {
  const [estado, accion] = useFormState(definirPuntoPedido, null);
  return (
    <form action={accion} className="form-linea">
      <input type="hidden" name="insumo_id" value={insumoId} />
      <label className="campo campo-corto">
        <span>Punto de pedido ({unidadBase})</span>
        <input name="punto" inputMode="numeric" defaultValue={actual ?? ''} placeholder="Sin alerta" />
      </label>
      <Enviar secundario chico>
        Guardar
      </Enviar>
      <Aviso estado={estado} />
    </form>
  );
}

/** Baja lógica o reactivación del insumo (su historial se conserva). */
export function FormEstadoInsumo({ insumoId, activo }: { insumoId: string; activo: boolean }) {
  const [estado, accion] = useFormState(cambiarEstadoInsumo, null);
  return (
    <form action={accion} className="form-linea">
      <input type="hidden" name="insumo_id" value={insumoId} />
      <input type="hidden" name="activo" value={activo ? 'false' : 'true'} />
      <Enviar secundario chico>
        {activo ? 'Dar de baja' : 'Reactivar'}
      </Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
