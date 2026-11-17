'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { registrarFraccionamiento } from '@/app/actions';
import { formatCantidad, parseNumero } from '@/lib/format';
import type { ActionState, SaldoInsumo, SaldoPresentacion } from '@/lib/types';
import { Mensaje, SubmitButton } from './ui';

type Props = { insumos: SaldoInsumo[]; presentaciones: SaldoPresentacion[] };

export function FormFraccionamiento({ insumos, presentaciones }: Props) {
  const [estado, accion] = useFormState<ActionState, FormData>(registrarFraccionamiento, null);
  const inicial = insumos.find((i) => Number(i.saldo_granel) > 0) ?? insumos[0];

  const [insumoId, setInsumoId] = useState(inicial?.insumo_id ?? '');
  // null = proponer el saldo a granel actual (se actualiza con cada consulta).
  const [extraidaEditada, setExtraida] = useState<string | null>(null);
  const [presentacionId, setPresentacionId] = useState('');
  const [unidades, setUnidades] = useState('4');
  const [merma, setMerma] = useState('0');

  useEffect(() => {
    if (estado?.ok) setExtraida(null);
  }, [estado]);

  const insumo = insumos.find((i) => i.insumo_id === insumoId) ?? inicial;
  if (!insumo) return <p className="vacio">Primero dé de alta un insumo.</p>;
  const extraida = extraidaEditada ?? String(Number(insumo.saldo_granel));

  const opciones = presentaciones.filter((p) => p.insumo_id === insumo.insumo_id);
  const presentacion = opciones.find((p) => p.presentacion_id === presentacionId) ?? opciones[0];
  if (!presentacion) return <p className="vacio">Cree una presentación de venta para «{insumo.nombre}».</p>;

  // Vista previa informativa: la validación real la hace la base de datos.
  const u = insumo.unidad_base;
  const vExtraida = parseNumero(extraida) ?? 0;
  const vSalida = (parseNumero(unidades) ?? 0) * Number(presentacion.contenido_base);
  const vMerma = parseNumero(merma) ?? 0;
  const diferencia = vExtraida - vSalida - vMerma;

  return (
    <form action={accion} className="formulario">
      <label>
        Contenedor a granel (insumo)
        <select
          name="insumo_id"
          value={insumo.insumo_id}
          onChange={(e) => {
            setInsumoId(e.target.value);
            setPresentacionId('');
            setExtraida(null);
          }}
        >
          {insumos.map((i) => (
            <option key={i.insumo_id} value={i.insumo_id}>
              {i.nombre} — granel {formatCantidad(i.saldo_granel, i.unidad_base)}
            </option>
          ))}
        </select>
      </label>
      <label>
        Cantidad extraída del granel ({u})
        <input name="cantidad_extraida" inputMode="decimal" required value={extraida} onChange={(e) => setExtraida(e.target.value)} />
      </label>
      <div className="fila">
        <label>
          Presentación producida
          <select name="presentacion_id" value={presentacion.presentacion_id} onChange={(e) => setPresentacionId(e.target.value)}>
            {opciones.map((p) => (
              <option key={p.presentacion_id} value={p.presentacion_id}>
                {p.nombre} ({formatCantidad(p.contenido_base, u)})
              </option>
            ))}
          </select>
        </label>
        <label>
          Unidades
          <input name="unidades" inputMode="numeric" required value={unidades} onChange={(e) => setUnidades(e.target.value)} />
        </label>
      </div>
      <label>
        Merma declarada ({u})
        <input name="merma" inputMode="decimal" value={merma} onChange={(e) => setMerma(e.target.value)} />
      </label>
      <label>
        Observación (opcional)
        <input name="observacion" autoComplete="off" />
      </label>

      <div className="balance" aria-live="polite">
        <div>
          <span>Extraído</span>
          <strong>{formatCantidad(vExtraida, u)}</strong>
        </div>
        <div>
          <span>Presentaciones</span>
          <strong>{formatCantidad(vSalida, u)}</strong>
        </div>
        <div>
          <span>Merma</span>
          <strong>{formatCantidad(vMerma, u)}</strong>
        </div>
        <div className={diferencia === 0 ? 'cuadra' : 'no-cuadra'}>
          <span>{diferencia >= 0 ? 'Sin explicar' : 'Exceso'}</span>
          <strong>{formatCantidad(Math.abs(diferencia), u)}</strong>
        </div>
      </div>
      <p className="ayuda">
        La vista previa es orientativa: el botón envía igualmente el movimiento y es la base de datos (PL/pgSQL) quien lo
        acepta o rechaza.
      </p>

      <SubmitButton>Registrar fraccionamiento</SubmitButton>
      <Mensaje estado={estado} />
    </form>
  );
}
