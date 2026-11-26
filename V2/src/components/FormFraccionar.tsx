'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { Boxes, Plus, Trash2 } from 'lucide-react';
import { fraccionar } from '@/app/acciones';
import { baseAMayor, formatBase, formatPresentacion, leerEnteroPositivo, unidadMayor } from '@/lib/formato';
import type { SaldoInsumo, SaldoPresentacion } from '@/lib/tipos';
import { Aviso, Enviar } from './ui';

interface Linea {
  clave: number;
  presentacionId: string;
  unidades: string;
}

let siguiente = 1;
const nuevaLinea = (presentacionId: string): Linea => ({ clave: siguiente++, presentacionId, unidades: '1' });

/**
 * Motor de Fraccionamiento. Lo que se descuenta del granel es exactamente lo
 * que suman las presentaciones generadas; el saldo restante se ve mientras se
 * carga. La base vuelve a validar todo al registrar.
 */
export function FormFraccionar({
  insumos,
  presentaciones,
}: {
  insumos: SaldoInsumo[];
  presentaciones: SaldoPresentacion[];
}) {
  const [estado, accion] = useFormState(fraccionar, null);
  const conPresentaciones = insumos.filter((i) => presentaciones.some((p) => p.insumo_id === i.insumo_id));
  const [insumoId, setInsumoId] = useState(conPresentaciones[0]?.insumo_id ?? '');
  const primeraDe = (id: string) => presentaciones.find((p) => p.insumo_id === id)?.presentacion_id ?? '';
  const [lineas, setLineas] = useState<Linea[]>(() => [nuevaLinea(primeraDe(insumoId))]);

  useEffect(() => {
    if (estado?.ok) setLineas([nuevaLinea(primeraDe(insumoId))]);
    // Solo al confirmar una operación.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [estado]);

  if (conPresentaciones.length === 0) {
    return (
      <section className="tarjeta">
        <p className="vacio">
          Ningún insumo tiene presentaciones. Agregalas en <Link href="/catalogo">Catálogo</Link>.
        </p>
      </section>
    );
  }

  const insumo = conPresentaciones.find((i) => i.insumo_id === insumoId) ?? conPresentaciones[0];
  const delInsumo = presentaciones.filter((p) => p.insumo_id === insumo.insumo_id);
  const base = insumo.unidad_base;
  const mayor = unidadMayor(base);

  const capacidad = (id: string) => delInsumo.find((p) => p.presentacion_id === id)?.capacidad_base ?? 0;
  const cantidades = lineas.map((l) => (leerEnteroPositivo(l.unidades) ?? 0) * capacidad(l.presentacionId));
  const total = cantidades.reduce((s, c) => s + c, 0);
  const quedara = insumo.saldo_granel - total;
  const valido = total > 0 && quedara >= 0 && lineas.every((l) => leerEnteroPositivo(l.unidades) !== null);

  function cambiar(clave: number, cambio: Partial<Linea>) {
    setLineas((ls) => ls.map((l) => (l.clave === clave ? { ...l, ...cambio } : l)));
  }

  return (
    <form action={accion} className="pila">
      <section className="tarjeta">
        <div className="tarjeta-cabecera">
          <h2>1. Insumo a granel de origen</h2>
        </div>
        <div className="origen">
          <label className="campo">
            <span>Insumo</span>
            <select
              name="insumo_id"
              value={insumo.insumo_id}
              onChange={(e) => {
                const id = e.target.value;
                setInsumoId(id);
                setLineas([nuevaLinea(primeraDe(id))]);
              }}
            >
              {conPresentaciones.map((i) => (
                <option key={i.insumo_id} value={i.insumo_id}>
                  {i.nombre} · {baseAMayor(i.saldo_granel)} {unidadMayor(i.unidad_base)} disponibles
                </option>
              ))}
            </select>
          </label>

          <dl className="stock" aria-live="polite">
            <div>
              <dt>Disponible</dt>
              <dd>{formatBase(insumo.saldo_granel, base)}</dd>
            </div>
            <div>
              <dt>Se descuenta</dt>
              <dd className="stock-descuento">{total > 0 ? `−${formatBase(total, base)}` : formatBase(0, base)}</dd>
            </div>
            <div className={quedara < 0 ? 'stock-quedara stock-insuficiente' : 'stock-quedara'}>
              <dt>Quedará</dt>
              <dd>{formatBase(quedara, base)}</dd>
            </div>
          </dl>
        </div>
        {quedara < 0 ? (
          <p className="aviso-linea" role="alert">
            Las presentaciones superan el stock disponible de {insumo.nombre}.
          </p>
        ) : null}
      </section>

      <section className="tarjeta">
        <div className="tarjeta-cabecera">
          <h2>2. Presentaciones a generar</h2>
          <button
            type="button"
            className="boton boton-secundario boton-chico"
            onClick={() => setLineas((ls) => [...ls, nuevaLinea(delInsumo[0]?.presentacion_id ?? '')])}
            disabled={lineas.length >= 20}
          >
            <Plus size={16} aria-hidden="true" /> Agregar presentación
          </button>
        </div>
        <ul className="renglones">
          {lineas.map((l, n) => (
            <li key={l.clave} className="renglon">
              <label className="campo">
                <span>Presentación</span>
                <select
                  name="presentacion_id"
                  value={l.presentacionId}
                  onChange={(e) => cambiar(l.clave, { presentacionId: e.target.value })}
                >
                  {delInsumo.map((p) => (
                    <option key={p.presentacion_id} value={p.presentacion_id}>
                      {formatPresentacion(p.capacidad_base, base)} ({formatBase(p.capacidad_base, base)} c/u)
                    </option>
                  ))}
                </select>
              </label>
              <label className="campo campo-corto">
                <span>Unidades</span>
                <input
                  name="unidades"
                  inputMode="numeric"
                  value={l.unidades}
                  onChange={(e) => cambiar(l.clave, { unidades: e.target.value })}
                  required
                />
              </label>
              <span className="renglon-total num">
                {baseAMayor(cantidades[n])} {mayor}
              </span>
              <button
                type="button"
                className="boton-icono"
                onClick={() => setLineas((ls) => ls.filter((x) => x.clave !== l.clave))}
                disabled={lineas.length === 1}
                aria-label="Quitar presentación"
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
        <label className="campo">
          <span>Observación (opcional)</span>
          <input type="text" name="observacion" maxLength={160} />
        </label>
      </section>

      <div className="acciones">
        <Aviso estado={estado} />
        <Enviar deshabilitado={!valido}>
          <Boxes size={16} aria-hidden="true" /> Confirmar fraccionamiento
        </Enviar>
      </div>
    </form>
  );
}
