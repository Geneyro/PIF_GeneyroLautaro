import 'server-only';
import { getSupabase } from './supabase';
import type { Movimiento, SaldoInsumo, SaldoPresentacion } from './types';

/** Consulta saldos y movimientos directamente a la base de datos (RF-04). */
export async function cargarDatos() {
  const supabase = getSupabase();

  const [insumos, presentaciones, movimientos] = await Promise.all([
    supabase.from('v_saldo_insumo').select('*').order('creado_en', { ascending: true }),
    supabase.from('v_saldo_presentacion').select('*').order('insumo_nombre').order('contenido_base'),
    supabase.from('v_movimiento').select('*').order('id', { ascending: false }).limit(50),
  ]);

  const error = insumos.error ?? presentaciones.error ?? movimientos.error;
  if (error) {
    throw new Error(`No se pudo consultar la base de datos: ${error.message}`);
  }

  return {
    insumos: (insumos.data ?? []) as SaldoInsumo[],
    presentaciones: (presentaciones.data ?? []) as SaldoPresentacion[],
    movimientos: (movimientos.data ?? []) as Movimiento[],
  };
}
