import 'server-only';
import { crearClienteServidor } from './supabase/servidor';
import type { ConteoFisico, Miembro, Movimiento, SaldoInsumo, SaldoPresentacion } from './tipos';

/*
 * Lecturas. Todas pasan por la sesión del usuario: las políticas de la base
 * solo devuelven filas de su organización, y las vistas calculan los saldos
 * como suma de movimientos.
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

export async function cargarMovimientos(limite = 300): Promise<Movimiento[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from('v_movimiento')
    .select('*')
    .order('id', { ascending: false })
    .limit(limite);
  fallar(error);
  return (data ?? []) as Movimiento[];
}

/** Membresía del usuario con sesión. Null si su cuenta todavía no fue aprobada. */
export async function miembroActual(usuarioId: string): Promise<Miembro | null> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from('miembro')
    .select('usuario_id, nombre, rol, creado_en')
    .eq('usuario_id', usuarioId)
    .maybeSingle();
  fallar(error);
  return (data as Miembro | null) ?? null;
}

/** Últimos conteos físicos (pestaña Insumos). */
export async function cargarConteos(limite = 20): Promise<ConteoFisico[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from('v_conteo_fisico')
    .select('*')
    .order('id', { ascending: false })
    .limit(limite);
  fallar(error);
  return (data ?? []) as ConteoFisico[];
}

/** Cantidad de insumos activos para reponer (insignia del menú). */
export async function contarAlertas(): Promise<number> {
  const { count } = await crearClienteServidor()
    .from('v_saldo_insumo')
    .select('insumo_id', { count: 'exact', head: true })
    .eq('activo', true)
    .eq('reponer', true);
  return count ?? 0;
}

/** Consumos de los últimos servicios (líneas CONSUMO, la más reciente primero). */
export async function cargarConsumos(limite = 120): Promise<Movimiento[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase
    .from('v_movimiento')
    .select('*')
    .eq('tipo', 'CONSUMO')
    .order('id', { ascending: false })
    .limit(limite);
  fallar(error);
  return (data ?? []) as Movimiento[];
}

