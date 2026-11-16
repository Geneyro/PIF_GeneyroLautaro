export type UnidadBase = 'mL' | 'g';
export type TipoMovimiento = 'INGRESO' | 'FRACCIONAMIENTO' | 'COMPENSACION';
export type Compartimento = 'GRANEL' | 'PRESENTACION' | 'MERMA';
export type RolUsuario = 'ADMINISTRADOR' | 'OPERARIO';

/** Tamaños de presentación admitidos (RF-02), en L o kg. */
export const TAMANOS_PRESENTACION = [1, 5, 20, 60, 120] as const;

/** Fila de la vista v_saldo_insumo. Cantidades en unidad base. */
export interface SaldoInsumo {
  insumo_id: string;
  nombre: string;
  unidad_base: UnidadBase;
  activo: boolean;
  saldo_granel: number;
  saldo_fraccionado: number;
  saldo_total: number;
  merma_acumulada: number;
  creado_en: string;
}

/** Fila de la vista v_saldo_presentacion. */
export interface SaldoPresentacion {
  presentacion_id: string;
  insumo_id: string;
  insumo_nombre: string;
  unidad_base: UnidadBase;
  capacidad_base: number;
  activo: boolean;
  unidades_en_existencia: number;
  saldo_base: number;
  saldo_total_insumo: number;
  equivalente_unidades: number;
}

/** Fila de la vista v_movimiento (una línea del libro). */
export interface Movimiento {
  id: number;
  operacion_id: string;
  tipo: TipoMovimiento;
  compartimento: Compartimento;
  insumo_id: string;
  insumo_nombre: string;
  unidad_base: UnidadBase;
  presentacion_id: string | null;
  capacidad_base: number | null;
  unidades: number | null;
  cantidad_base: number;
  proveedor_nombre: string | null;
  costo_centavos: number | null;
  motivo: string | null;
  observacion: string | null;
  movimiento_origen_id: number | null;
  compensado: boolean;
  usuario_id: string;
  usuario_nombre: string | null;
  registrado_en: string;
}

/** Usuario con acceso a la organización. */
export interface Miembro {
  usuario_id: string;
  nombre: string;
  rol: RolUsuario;
  creado_en: string;
}

/** Cuenta registrada que espera aprobación. */
export interface SolicitudAcceso {
  usuario_id: string;
  nombre: string;
  correo: string | null;
  rol_solicitado: RolUsuario;
  creado_en: string;
}

/** Resultado de una acción de formulario. */
export type Estado = { ok: boolean; mensaje: string; detalle?: string } | null;
