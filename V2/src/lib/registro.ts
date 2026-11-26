import { formatBase, formatPesos, formatPresentacion } from './formato';
import type { Movimiento, TipoMovimiento, UnidadBase } from './tipos';

/*
 * Libro de auditoría unificado (pestaña Movimientos).
 * Agrupa las líneas del libro mayor en una fila por operación e insumo, y
 * describe cada una en el idioma del taller.
 */

export const ORIGENES = ['Motor de Fraccionamiento', 'Insumos', 'Servicios', 'Ingresos', 'Corrección'] as const;
export type Origen = (typeof ORIGENES)[number];

const ORIGEN_POR_TIPO: Record<TipoMovimiento, Origen> = {
  FRACCIONAMIENTO: 'Motor de Fraccionamiento',
  AJUSTE: 'Insumos',
  CONSUMO: 'Servicios',
  INGRESO: 'Ingresos',
  COMPENSACION: 'Corrección',
};

const TIPO: Record<TipoMovimiento, string> = {
  FRACCIONAMIENTO: 'Fraccionamiento',
  AJUSTE: 'Ajuste por conteo',
  CONSUMO: 'Consumo de servicio',
  INGRESO: 'Ingreso',
  COMPENSACION: 'Corrección',
};

export interface FilaRegistro {
  clave: string;
  operacionId: string;
  fecha: string;
  insumo: string;
  unidad: UnidadBase;
  origen: Origen;
  tipo: string;
  /** Variación del saldo a granel (unidad base, con signo). */
  variacion: number;
  detalle: string;
  usuario: string;
  /** La operación todavía puede anularse con una compensación. */
  anulable: boolean;
  anulada: boolean;
  /** Primera fila de su operación (las demás comparten fecha y usuario). */
  primeraDeOperacion: boolean;
}

function describir(lineas: Movimiento[]): string {
  const m = lineas[0];
  const partes: string[] = [];
  switch (m.tipo) {
    case 'FRACCIONAMIENTO': {
      const pres = lineas.filter((l) => l.compartimento === 'PRESENTACION' && l.capacidad_base !== null);
      if (pres.length) {
        partes.push(
          pres.map((l) => `${l.unidades} × ${formatPresentacion(l.capacidad_base as number, l.unidad_base)}`).join(' · '),
        );
      }
      const merma = lineas.find((l) => l.compartimento === 'MERMA');
      if (merma) partes.push(`Merma ${formatBase(merma.cantidad_base, merma.unidad_base)} (${merma.motivo})`);
      break;
    }
    case 'AJUSTE':
      if (m.conteo_saldo_sistema !== null && m.conteo_fisico !== null) {
        partes.push(
          `Sistema ${formatBase(m.conteo_saldo_sistema, m.unidad_base)} · contado ${formatBase(m.conteo_fisico, m.unidad_base)}`,
        );
      }
      break;
    case 'CONSUMO':
      if (m.servicio_nombre) partes.push(`${m.servicio_nombre} · ${m.servicio_vehiculo}`);
      break;
    case 'INGRESO':
      if (m.proveedor_nombre) partes.push(m.proveedor_nombre);
      if (m.costo_centavos !== null) partes.push(formatPesos(m.costo_centavos));
      break;
    case 'COMPENSACION':
      partes.push(`Anula ${m.tipo_origen ? TIPO[m.tipo_origen].toLowerCase() : 'una operación'}`);
      if (m.motivo) partes.push(m.motivo);
      break;
  }
  if (m.observacion) partes.push(m.observacion);
  return partes.join(' · ');
}

/** `movimientos` llega del más reciente al más antiguo; el orden se conserva. */
export function armarRegistro(movimientos: Movimiento[]): FilaRegistro[] {
  const grupos = new Map<string, Movimiento[]>();
  for (const m of movimientos) {
    const clave = `${m.operacion_id}:${m.insumo_id}`;
    const lineas = grupos.get(clave);
    if (lineas) lineas.push(m);
    else grupos.set(clave, [m]);
  }

  const anuladas = new Set(movimientos.filter((m) => m.compensado).map((m) => m.operacion_id));
  const vistas = new Set<string>();

  return [...grupos.entries()].map(([clave, desc]) => {
    const lineas = [...desc].reverse();
    const m = lineas[0];
    const primera = !vistas.has(m.operacion_id);
    vistas.add(m.operacion_id);
    const anulada = anuladas.has(m.operacion_id);
    return {
      clave,
      operacionId: m.operacion_id,
      fecha: m.registrado_en,
      insumo: m.insumo_nombre,
      unidad: m.unidad_base,
      origen: ORIGEN_POR_TIPO[m.tipo],
      tipo: TIPO[m.tipo],
      variacion: lineas.filter((l) => l.compartimento === 'GRANEL').reduce((s, l) => s + l.cantidad_base, 0),
      detalle: describir(lineas),
      usuario: m.usuario_nombre ?? 'Usuario desconocido',
      anulable: primera && !anulada && m.tipo !== 'COMPENSACION',
      anulada,
      primeraDeOperacion: primera,
    };
  });
}

/** "+1.500 mL", "-200 mL", "0 mL" */
export function formatVariacion(cantidad: number, unidad: UnidadBase): string {
  return (cantidad > 0 ? '+' : '') + formatBase(cantidad, unidad);
}
