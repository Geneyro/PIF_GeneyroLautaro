'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useFormState } from 'react-dom';
import { Plus, Trash2, Wrench } from 'lucide-react';
import { registrarServicio } from '@/app/acciones';
import { formatBase, leerEnteroPositivo } from '@/lib/formato';
import type { SaldoInsumo } from '@/lib/tipos';
import { Aviso, Enviar } from './ui';

interface Linea {
  clave: number;
  insumoId: string;
  cantidad: string;
}

let siguiente = 1;

/**
 * Servicios · nombre, vehículo y receta de consumo. Cada insumo se descuenta
 * del granel al registrar; si alguno no alcanza, no se registra nada.
 */
export function FormServicio({ insumos }: { insumos: SaldoInsumo[] }) {
  const [estado, accion] = useFormState(registrarServicio, null);
  const ref = useRef<HTMLFormElement>(null);
  const nueva = (): Linea => ({ clave: siguiente++, insumoId: insumos[0]?.insumo_id ?? '', cantidad: '' });
  const [lineas, setLineas] = useState<Linea[]>(() => [nueva()]);

  useEffect(() => {
    if (estado?.ok) {
      ref.current?.reset();
      setLineas([nueva()]);
    }
    // Solo al confirmar un servicio.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (insumos.length === 0) {
    return (
      <section className="tarjeta">
        <p className="vacio">
          Todavía no hay insumos. Agregalos en <Link href="/insumos">Insumos</Link>.
        </p>
      </section>
    );
  }

  // Lo que usa la receta de cada insumo (puede repetirse en varias líneas).
  const usado = new Map<string, number>();
  for (const l of lineas) {
    usado.set(l.insumoId, (usado.get(l.insumoId) ?? 0) + (leerEnteroPositivo(l.cantidad) ?? 0));
  }
  const excedidos = insumos.filter((i) => (usado.get(i.insumo_id) ?? 0) > i.saldo_granel);
  const valido = excedidos.length === 0 && lineas.every((l) => l.insumoId && leerEnteroPositivo(l.cantidad) !== null);

  function cambiar(clave: number, cambio: Partial<Linea>) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  return (
    <form ref={ref} action={accion} className="tarjeta pila">
      <div className="tarjeta-cabecera">
        <h2>Registrar servicio</h2>
      </div>

      <div className="dos-campos">
        <label className="campo">
          <span>Nombre del servicio</span>
          <input type="text" name="nombre" required maxLength={120} placeholder="Ej.: Lavado premium" />
        </label>
        <label className="campo">
          <span>Tipo de vehículo</span>
          <input type="text" name="vehiculo" required maxLength={120} placeholder="Ej.: SUV, sedán, moto" />
        </label>
      </div>

      <fieldset className="receta">
        <legend>Receta de consumo</legend>
        <ul className="renglones">
          {lineas.map((l) => {
            const insumo = insumos.find((i) => i.insumo_id === l.insumoId);
            const base = insumo?.unidad_base ?? 'mL';
            const excedido = insumo ? (usado.get(insumo.insumo_id) ?? 0) > insumo.saldo_granel : false;
            return (
              <li key={l.clave} className="renglon">
                <label className="campo">
                  <span>Insumo</span>
                  <select name="insumo_id" value={l.insumoId} onChange={(e) => cambiar(l.clave, { insumoId: e.target.value })}>
                    {insumos.map((i) => (
                      <option key={i.insumo_id} value={i.insumo_id}>
                        {i.nombre}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="campo campo-corto">
                  <span>Cantidad ({base})</span>
                  <input
                    name="cantidad"
                    inputMode="numeric"
                    value={l.cantidad}
                    onChange={(e) => cambiar(l.clave, { cantidad: e.target.value })}
                    aria-invalid={excedido}
                    required
                  />
                </label>
                <span className={excedido ? 'renglon-total stock-insuficiente' : 'renglon-total suave'}>
                  {insumo ? `${formatBase(insumo.saldo_granel, base)} disponibles` : ''}
                </span>
                <button
                  type="button"
                  className="boton-icono"
                  onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                  disabled={lineas.length === 1}
                  aria-label="Quitar insumo"
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
        <button
          type="button"
          className="boton boton-secundario boton-chico"
          onClick={() => setLineas((ls) => [...ls, nueva()])}
          disabled={lineas.length >= 20}
        >
          <Plus size={16} aria-hidden="true" /> Agregar insumo
        </button>
      </fieldset>

      {excedidos.length > 0 ? (
        <p className="aviso-linea" role="alert">
          No alcanza el stock de {excedidos.map((i) => i.nombre).join(', ')}.
        </p>
      ) : null}

      <div className="acciones">
        <Aviso estado={estado} />
        <Enviar deshabilitado={!valido}>
          <Wrench size={16} aria-hidden="true" /> Registrar servicio
        </Enviar>
      </div>
    </form>
  );
}
