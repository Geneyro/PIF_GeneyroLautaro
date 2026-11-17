import 'server-only';
import { crearClienteServidor } from './supabase/servidor';
import type { Miembro, Movimiento, SaldoInsumo, SaldoPresentacion, SolicitudAcceso } from './tipos';

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

export async function cargarMiembros(): Promise<Miembro[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase.from('miembro').select('usuario_id, nombre, rol, creado_en').order('creado_en');
  fallar(error);
  return (data ?? []) as Miembro[];
}

/** Solicitudes de acceso. La base solo se las devuelve a un administrador. */
export async function cargarSolicitudes(): Promise<SolicitudAcceso[]> {
  const supabase = crearClienteServidor();
  const { data, error } = await supabase.from('solicitud_acceso').select('*').order('creado_en');
  fallar(error);
  return (data ?? []) as SolicitudAcceso[];
}
