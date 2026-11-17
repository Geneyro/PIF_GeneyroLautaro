'use client';

import { useFormState } from 'react-dom';
import { compensarOperacion } from '@/app/acciones';
import { Aviso, Enviar } from './ui';

/**
 * RF-05 · Los movimientos no se editan ni se borran: la única corrección
 * posible es registrar una compensación que referencia a la operación original.
 */
export function FormCompensar({ operacionId }: { operacionId: string }) {
  const [estado, accion] = useFormState(compensarOperacion, null);
  return (
    <details className="corregir">
      <summary>Corregir</summary>
      <form action={accion} className="form-linea">
        <input type="hidden" name="operacion_id" value={operacionId} />
        <label className="campo">
          <span>Motivo de la corrección</span>
          <input type="text" name="motivo" required maxLength={160} />
        </label>
        <Enviar secundario>Registrar compensación</Enviar>
        <Aviso estado={estado} />
      </form>
    </details>
  );
}
