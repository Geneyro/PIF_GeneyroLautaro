'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { registrarIngreso } from '@/app/actions';
import { formatCantidad, parseNumero } from '@/lib/format';
import { UNIDADES_POR_BASE, type ActionState, type SaldoInsumo } from '@/lib/types';
import { Mensaje, SubmitButton } from './ui';

export function FormIngreso({ insumos }: { insumos: SaldoInsumo[] }) {
  const [estado, accion] = useFormState<ActionState, FormData>(registrarIngreso, null);
  const [insumoId, setInsumoId] = useState(insumos[0]?.insumo_id ?? '');
  const [cantidad, setCantidad] = useState('5');

  const insumo = insumos.find((i) => i.insumo_id === insumoId) ?? insumos[0];
  const unidades = insumo ? UNIDADES_POR_BASE[insumo.unidad_base] : [];
  const [unidadElegida, setUnidad] = useState(unidades[0]?.valor ?? 'L');
  const unidad = unidades.some((u) => u.valor === unidadElegida) ? unidadElegida : (unidades[0]?.valor ?? 'L');
  const factor = unidades.find((u) => u.valor === unidad)?.factor ?? 1;
  const n = parseNumero(cantidad);

  if (!insumo) return <p className="vacio">Primero dé de alta un insumo.</p>;

  return (
    <form action={accion} className="formulario">
      <label>
        Insumo
        <select
          name="insumo_id"
          value={insumo.insumo_id}
          onChange={(e) => {
            setInsumoId(e.target.value);
            const nuevo = insumos.find((i) => i.insumo_id === e.target.value);
            if (nuevo) setUnidad(UNIDADES_POR_BASE[nuevo.unidad_base][0].valor);
          }}
        >
          {insumos.map((i) => (
            <option key={i.insumo_id} value={i.insumo_id}>
              {i.nombre} ({i.unidad_base})
            </option>
          ))}
        </select>
      </label>
      <div className="fila">
        <label>
          Cantidad
          <input name="cantidad" inputMode="decimal" required value={cantidad} onChange={(e) => setCantidad(e.target.value)} />
        </label>
        <label>
          Unidad
          <select name="unidad" value={unidad} onChange={(e) => setUnidad(e.target.value)}>
            {unidades.map((u) => (
              <option key={u.valor} value={u.valor}>
                {u.valor}
              </option>
            ))}
          </select>
        </label>
      </div>
      <label>
        Observación (opcional)
        <input name="observacion" placeholder="Ej.: Bidón 5 L, remito 0001-123" autoComplete="off" />
      </label>
      {n !== null && n > 0 && (
        <p className="conversion">
          {formatCantidad(n, unidad)} = <strong>{formatCantidad(n * factor, insumo.unidad_base)}</strong> en unidad base
        </p>
      )}
      <SubmitButton>Registrar ingreso</SubmitButton>
      <Mensaje estado={estado} />
    </form>
  );
}
