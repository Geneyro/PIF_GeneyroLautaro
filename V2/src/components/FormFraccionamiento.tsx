'use client';

import { useState } from 'react';
import { useFormState } from 'react-dom';
import { registrarFraccionamiento } from '@/app/acciones';
import { formatBase, formatCantidad, formatPresentacion, leerEnteroNoNegativo, leerEnteroPositivo, unidadMayor } from '@/lib/formato';
import type { SaldoInsumo, SaldoPresentacion } from '@/lib/tipos';
import { Aviso, Enviar, useLimpiarAlConfirmar } from './ui';

/**
 * RF-01 / RF-06 · Fraccionamiento.
 * El recuadro de balance es solo una ayuda visual: el formulario se envía
 * igual y quien acepta o rechaza es la función de la base de datos.
 */
export function FormFraccionamiento({
  insumos,
  presentaciones,
}: {
  insumos: SaldoInsumo[];
  presentaciones: SaldoPresentacion[];
}) {
  const [estado, accion] = useFormState(registrarFraccionamiento, null);
  const ref = useLimpiarAlConfirmar(estado);
  const [insumoId, setInsumoId] = useState(insumos[0]?.insumo_id ?? '');
  const [presentacionId, setPresentacionId] = useState('');
  const [cantidad, setCantidad] = useState('');
  const [enMayor, setEnMayor] = useState(true);
  const [unidades, setUnidades] = useState('');
  const [merma, setMerma] = useState('');

  const insumo = insumos.find((i) => i.insumo_id === insumoId);
  if (!insumo) return <p className="vacio">Primero dé de alta un insumo en el Catálogo.</p>;

  const base = insumo.unidad_base;
  const delInsumo = presentaciones.filter((p) => p.insumo_id === insumoId);
  const presentacion = delInsumo.find((p) => p.presentacion_id === presentacionId) ?? delInsumo[0];

  const nCantidad = leerEnteroPositivo(cantidad);
  const origen = nCantidad === null ? null : enMayor ? nCantidad * 1000 : nCantidad;
  const nUnidades = leerEnteroPositivo(unidades);
  const nMerma = leerEnteroNoNegativo(merma) ?? 0;
  const salida = presentacion && nUnidades !== null ? nUnidades * presentacion.capacidad_base : null;
  const diferencia = origen !== null && salida !== null ? origen - salida - nMerma : null;

  function limpiar() {
    setCantidad('');
    setUnidades('');
    setMerma('');
  }

  return (
    <form ref={ref} action={accion} className="form" onReset={limpiar}>
      <label className="campo">
        <span>Insumo</span>
        <select
          name="insumo_id"
          value={insumoId}
          onChange={(e) => {
            setInsumoId(e.target.value);
            setPresentacionId('');
          }}
        >
          {insumos.map((i) => (
            <option key={i.insumo_id} value={i.insumo_id}>
              {i.nombre}
            </option>
          ))}
        </select>
      </label>
      <p className="ayuda">Saldo a granel: {formatCantidad(insumo.saldo_granel, base)}.</p>

      {delInsumo.length === 0 ? (
        <p className="vacio">Este insumo no tiene presentaciones. Agréguelas en el Catálogo.</p>
      ) : (
        <>
          <div className="fila">
            <label className="campo">
              <span>Cantidad tomada del origen</span>
              <input
                type="text"
                inputMode="numeric"
                name="cantidad_origen"
                required
                value={cantidad}
                onChange={(e) => setCantidad(e.target.value)}
                placeholder="Ej.: 5"
              />
            </label>
            <label className="campo campo-corto">
              <span>Unidad</span>
              <select
                name="unidad_origen"
                value={enMayor ? unidadMayor(base) : base}
                onChange={(e) => setEnMayor(e.target.value !== base)}
              >
                <option value={unidadMayor(base)}>{unidadMayor(base)}</option>
                <option value={base}>{base}</option>
              </select>
            </label>
          </div>

          <div className="fila">
            <label className="campo">
              <span>Presentación</span>
              <select
                name="presentacion_id"
                value={presentacion?.presentacion_id ?? ''}
                onChange={(e) => setPresentacionId(e.target.value)}
              >
                {delInsumo.map((p) => (
                  <option key={p.presentacion_id} value={p.presentacion_id}>
                    {formatPresentacion(p.capacidad_base, base)}
                  </option>
                ))}
              </select>
            </label>
            <label className="campo campo-corto">
              <span>Unidades</span>
              <input
                type="text"
                inputMode="numeric"
                name="unidades"
                required
                value={unidades}
                onChange={(e) => setUnidades(e.target.value)}
                placeholder="Ej.: 5"
              />
            </label>
          </div>

          <div className="fila">
            <label className="campo campo-corto">
              <span>Merma ({base})</span>
              <input
                type="text"
                inputMode="numeric"
                name="merma"
                value={merma}
                onChange={(e) => setMerma(e.target.value)}
                placeholder="0"
              />
            </label>
            <label className="campo">
              <span>Motivo de la merma</span>
              <input type="text" name="motivo_merma" maxLength={120} placeholder="Obligatorio si hay merma" />
            </label>
          </div>

          {origen !== null && salida !== null && diferencia !== null ? (
            <div className={diferencia === 0 ? 'balance balance-ok' : 'balance balance-mal'}>
              <span>Tomado: {formatBase(origen, base)}</span>
              <span>
                Presentaciones: {formatBase(salida, base)} · Merma: {formatBase(nMerma, base)}
              </span>
              <strong>
                {diferencia === 0
                  ? 'Las cantidades cierran.'
                  : diferencia > 0
                    ? `Quedan ${formatBase(diferencia, base)} sin explicar.`
                    : `Las salidas exceden en ${formatBase(-diferencia, base)}.`}
              </strong>
            </div>
          ) : null}

          <Enviar>Registrar fraccionamiento</Enviar>
        </>
      )}
      <Aviso estado={estado} />
    </form>
  );
}
