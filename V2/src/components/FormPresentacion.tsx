'use client';

import { useFormState } from 'react-dom';
import { agregarPresentacion } from '@/app/acciones';
import { unidadMayor } from '@/lib/formato';
import type { UnidadBase } from '@/lib/tipos';
import { Aviso, Enviar } from './ui';

/** RF-02 · Agrega a un insumo una de las presentaciones que todavía no tiene. */
export function FormPresentacion({
  insumoId,
  unidadBase,
  faltantes,
}: {
  insumoId: string;
  unidadBase: UnidadBase;
  faltantes: number[];
}) {
  const [estado, accion] = useFormState(agregarPresentacion, null);
  if (faltantes.length === 0) return null;
  return (
    <form action={accion} className="form-linea">
      <input type="hidden" name="insumo_id" value={insumoId} />
      <label className="campo">
        <span>Agregar presentación</span>
        <select name="tamano" required defaultValue="">
          <option value="" disabled>
            Elegir…
          </option>
          {faltantes.map((t) => (
            <option key={t} value={t}>
              {t} {unidadMayor(unidadBase)}
            </option>
          ))}
        </select>
      </label>
      <Enviar secundario>Agregar</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
