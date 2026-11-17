'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { crearInsumo } from '@/app/acciones';
import { TAMANOS_PRESENTACION, type UnidadBase } from '@/lib/tipos';
import { Aviso, Enviar, useLimpiarAlConfirmar } from './ui';

/** RF-02 · Alta de insumo a granel con unidad base y presentaciones. */
export function FormInsumo() {
  const [estado, accion] = useFormState(crearInsumo, null);
  const ref = useLimpiarAlConfirmar(estado);
  const [base, setBase] = useState<UnidadBase | null>(null);
  const mayor = base === 'g' ? 'kg' : 'L';

  return (
    <form ref={ref} action={accion} className="form" onReset={() => setBase(null)}>
      <label className="campo">
        <span>Nombre del insumo</span>
        <input type="text" name="nombre" required maxLength={80} placeholder="Ej.: Citrolimp" />
      </label>

      <fieldset className="campo">
        <legend>Unidad base</legend>
        <div className="opciones">
          <label className="opcion">
            <input type="radio" name="unidad_base" value="mL" checked={base === 'mL'} onChange={() => setBase('mL')} />
            Líquido (mL)
          </label>
          <label className="opcion">
            <input type="radio" name="unidad_base" value="g" checked={base === 'g'} onChange={() => setBase('g')} />
            Sólido (g)
          </label>
        </div>
      </fieldset>

      <fieldset className="campo">
        <legend>Presentaciones</legend>
        <div className="opciones">
          {TAMANOS_PRESENTACION.map((t) => (
            <label key={t} className="opcion">
              <input type="checkbox" name="presentaciones" value={t} />
              {t} {mayor}
            </label>
          ))}
        </div>
      </fieldset>

      <Enviar>Dar de alta</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
