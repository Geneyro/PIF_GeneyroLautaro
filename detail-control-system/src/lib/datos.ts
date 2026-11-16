import 'server-only';
import { crearClienteServidor } from './supabase/servidor';
import type { Movimiento, SaldoInsumo, SaldoPresentacion } from './tipos';

/*
 * Lecturas. Todas pasan por las vistas de la base, que calculan los saldos
 * como suma de movimientos y solo devuelven filas de la organización del
 * usuario con sesión.
 */

function fallar(error: { message: string } | null) {
  if (error) throw new Error(`No se pudo consultar la base de datos: ${error.message}`);
}

export async function cargarSaldos(): Promise<{ insumos: SaldoInsumo[]; presentaciones: SaldoPresentacion[] }> {
  const supabase = crearClienteServidor();
  const [insumos, presentaciones] = await Promise.all([
    supabase.from('v_saldo_insumo').select('*').eq('activo', true).order('nombre'),
    supabase.from('v_saldo_presentacion').select('*').eq('activo', true).order('capacidad_base'),
  ]);
  fallar(insumos.error ?? presentaciones.error);
  return {
    insumos: (insumos.data ?? []) as SaldoInsumo[],
    presentaciones: (presentaciones.data ?? []) as SaldoPresentacion[],
  };
}

export async function cargarProveedores(): Promise<string[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase.from('proveedor').select('nombre').eq('activo', true).order('nombre');
  fallar(error);
  return (data ?? []).map((p) => p.nombre as string);
}

export async function cargarMovimientos(limite = 150): Promise<Movimiento[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from('v_movimiento')
    .select('*')
    .order('id', { ascending: false })
    .limit(limite);
  fallar(error);
  return (data ?? []) as Movimiento[];
}

export async function nombreDelUsuario(usuarioId: string): Promise<string | null> {
  const supabase = crearClienteServidor();
  const { data } = await supabase.from('miembro').select('nombre').eq('usuario_id', usuarioId).maybeSingle();
  return (data?.nombre as string | undefined) ?? null;
}
