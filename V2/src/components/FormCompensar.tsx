'use client';

import { useFormState } from 'react-dom';
import { compensarOperacion } from '@/app/acciones';
import { Aviso, Enviar } from './ui';

/**
 * RF-05 · Los movimientos no se editan ni se borran: la única corrección
 * posible es anular la operación con una compensación que la referencia.
 */
export function FormCompensar({ operacionId }: { operacionId: string }) {
  const [estado, accion] = useFormState(compensarOperacion, null);
  return (
    <details className="corregir">
      <summary>Anular</summary>
      <form action={accion} className="corregir-form">
        <input type="hidden" name="operacion_id" value={operacionId} />
        <label className="campo">
          <span>Motivo</span>
          <input type="text" name="motivo" required maxLength={160} />
        </label>
        <Enviar secundario chico>
          Registrar anulación
        </Enviar>
        <Aviso estado={estado} />
      </form>
    </details>
  );
}
