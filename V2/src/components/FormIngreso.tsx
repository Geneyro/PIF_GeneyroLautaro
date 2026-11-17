'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { registrarIngreso } from '@/app/acciones';
import { formatBase, leerEnteroPositivo, unidadMayor } from '@/lib/formato';
import type { SaldoInsumo } from '@/lib/tipos';
import { Aviso, Enviar, useLimpiarAlConfirmar } from './ui';

/** RF-03 · Ingreso de insumo, con proveedor y costo obligatorios. */
export function FormIngreso({ insumos, proveedores }: { insumos: SaldoInsumo[]; proveedores: string[] }) {
  const [estado, accion] = useFormState(registrarIngreso, null);
  const ref = useLimpiarAlConfirmar(estado);
  const [insumoId, setInsumoId] = useState(insumos[0]?.insumo_id ?? '');
  const [cantidad, setCantidad] = useState('');
  const [enMayor, setEnMayor] = useState(true);

  const insumo = insumos.find((i) => i.insumo_id === insumoId);
  if (!insumo) return <p className="vacio">Primero dé de alta un insumo en el Catálogo.</p>;

  const base = insumo.unidad_base;
  const n = leerEnteroPositivo(cantidad);
  const enBase = n === null ? null : enMayor ? n * 1000 : n;

  return (
    <form ref={ref} action={accion} className="form" onReset={() => setCantidad('')}>
      <label className="campo">
        <span>Insumo</span>
        <select name="insumo_id" value={insumoId} onChange={(e) => setInsumoId(e.target.value)}>
          {insumos.map((i) => (
            <option key={i.insumo_id} value={i.insumo_id}>
              {i.nombre}
            </option>
          ))}
        </select>
      </label>

      <div className="fila">
        <label className="campo">
          <span>Cantidad</span>
          <input
            type="text"
            inputMode="numeric"
            name="cantidad"
            required
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
            placeholder="Ej.: 1000"
          />
        </label>
        <label className="campo campo-corto">
          <span>Unidad</span>
          <select name="unidad" value={enMayor ? unidadMayor(base) : base} onChange={(e) => setEnMayor(e.target.value !== base)}>
            <option value={unidadMayor(base)}>{unidadMayor(base)}</option>
            <option value={base}>{base}</option>
          </select>
        </label>
      </div>
      {enBase !== null ? <p className="ayuda">Se registran {formatBase(enBase, base)}.</p> : null}

      <label className="campo">
        <span>Proveedor</span>
        <input type="text" name="proveedor" required list="proveedores" maxLength={80} />
        <datalist id="proveedores">
          {proveedores.map((p) => (
            <option key={p} value={p} />
          ))}
        </datalist>
      </label>

      <label className="campo">
        <span>Costo total del ingreso ($)</span>
        <input type="text" inputMode="decimal" name="costo" required placeholder="Ej.: 2.400.000" />
      </label>

      <label className="campo">
        <span>Observación (opcional)</span>
        <input type="text" name="observacion" maxLength={200} />
      </label>

      <Enviar>Registrar ingreso</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
