export type UnidadBase = 'mL' | 'g';

/** Fila de la vista v_saldo_insumo (RF-04). Cantidades en unidad base. */
export type SaldoInsumo = {
  insumo_id: string;
  nombre: string;
  unidad_base: UnidadBase;
  saldo_granel: number;
  saldo_presentaciones: number;
  saldo_total: number;
  merma_acumulada: number;
};

/** Fila de la vista v_saldo_presentacion. */
export type SaldoPresentacion = {
  presentacion_id: string;
  insumo_id: string;
  insumo_nombre: string;
  unidad_base: UnidadBase;
  nombre: string;
  contenido_base: number;
  unidades: number;
  saldo_base: number;
};

/** Fila de la vista v_movimiento. */
export type Movimiento = {
  id: number;
  operacion_id: string;
  tipo: 'INGRESO' | 'FRACCIONAMIENTO';
  compartimento: 'GRANEL' | 'PRESENTACION' | 'MERMA';
  insumo_nombre: string;
  unidad_base: UnidadBase;
  presentacion_nombre: string | null;
  unidades: number | null;
  cantidad_base: number;
  cantidad_original: number | null;
  unidad_original: string | null;
  observacion: string | null;
  registrado_en: string;
};

/** Resultado que devuelven las Server Actions a los formularios. */
export type ActionState = {
  ok: boolean;
  mensaje: string;
  detalle?: string;
} | null;

/** Unidades de ingreso admitidas para cada unidad base (y su factor). */
export const UNIDADES_POR_BASE: Record<UnidadBase, { valor: string; factor: number }[]> = {
  mL: [
    { valor: 'L', factor: 1000 },
    { valor: 'mL', factor: 1 },
  ],
  g: [
    { valor: 'kg', factor: 1000 },
    { valor: 'g', factor: 1 },
  ],
};
