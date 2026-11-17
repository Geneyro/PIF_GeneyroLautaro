'use client';

import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { crearPresentacion } from '@/app/actions';
import { UNIDADES_POR_BASE, type ActionState, type SaldoInsumo } from '@/lib/types';
import { Mensaje, SubmitButton } from './ui';

export function FormPresentacion({ insumos }: { insumos: SaldoInsumo[] }) {
  const [estado, accion] = useFormState<ActionState, FormData>(crearPresentacion, null);
  const [insumoId, setInsumoId] = useState(insumos[0]?.insumo_id ?? '');
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);

  const insumo = insumos.find((i) => i.insumo_id === insumoId) ?? insumos[0];
  if (!insumo) return <p className="vacio">Primero dé de alta un insumo.</p>;
  const unidades = UNIDADES_POR_BASE[insumo.unidad_base];

  return (
    <form ref={form} action={accion} className="formulario">
      <label>
        Insumo
        <select name="insumo_id" value={insumo.insumo_id} onChange={(e) => setInsumoId(e.target.value)}>
          {insumos.map((i) => (
            <option key={i.insumo_id} value={i.insumo_id}>
              {i.nombre} ({i.unidad_base})
            </option>
          ))}
        </select>
      </label>
      <label>
        Nombre de la presentación
        <input name="nombre" required defaultValue="Botella 1 L" autoComplete="off" />
      </label>
      <div className="fila">
        <label>
          Contenido por unidad
          <input name="contenido" inputMode="decimal" required defaultValue="1" />
        </label>
        <label>
          Unidad
          <select name="unidad" key={insumo.unidad_base} defaultValue={unidades[0].valor}>
            {unidades.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.valor}
              </option>
            ))}
          </select>
        </label>
      </div>
      <SubmitButton variante="secundario">Crear presentación</SubmitButton>
      <Mensaje estado={estado} />
    </form>
  );
}
