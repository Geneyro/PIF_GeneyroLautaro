'use server';

import { revalidatePath } from 'next/cache';
import { formatCantidad, parseNumero } from '@/lib/format';
import { getSupabase } from '@/lib/supabase';
import type { ActionState, SaldoInsumo } from '@/lib/types';

/*
 * Server Actions: se ejecutan solo en el servidor y delegan TODA la lógica de
 * negocio en las funciones PL/pgSQL. Si la base rechaza la operación, su
 * mensaje se devuelve tal cual a la interfaz.
 */

function texto(fd: FormData, campo: string): string | null {
  const v = fd.get(campo);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

async function rpc(fn: string, args: Record<string, unknown>) {
  return getSupabase().rpc(fn, args);
}

async function saldoDe(insumoId: string): Promise<SaldoInsumo | null> {
  const { data } = await getSupabase()
    .from('v_saldo_insumo')
    .select('*')
    .eq('insumo_id', insumoId)
    .maybeSingle();
  return (data as SaldoInsumo | null) ?? null;
}

async function ejecutar(accion: () => Promise<ActionState>): Promise<ActionState> {
  try {
    return await accion();
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'Error inesperado.' };
  }
}

// RF-02 · Alta de insumo en unidad base
export async function crearInsumo(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return ejecutar(async () => {
    const nombre = texto(fd, 'nombre');
    const unidadBase = texto(fd, 'unidad_base');
    const { error } = await rpc('crear_insumo', { p_nombre: nombre, p_unidad_base: unidadBase });
    if (error) return { ok: false, mensaje: error.message, detalle: error.hint ?? undefined };
    revalidatePath('/');
    return { ok: true, mensaje: `Insumo "${nombre}" creado con unidad base ${unidadBase}.` };
  });
}

// RF-03 · Ingreso a granel con conversión a unidad base
export async function registrarIngreso(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return ejecutar(async () => {
    const insumoId = texto(fd, 'insumo_id');
    const cantidad = parseNumero(texto(fd, 'cantidad'));
    const unidad = texto(fd, 'unidad');
    const { error } = await rpc('registrar_ingreso', {
      p_insumo_id: insumoId,
      p_cantidad: cantidad,
      p_unidad: unidad,
      p_observacion: texto(fd, 'observacion'),
    });
    if (error) return { ok: false, mensaje: error.message, detalle: error.hint ?? undefined };
    revalidatePath('/');
    const saldo = insumoId ? await saldoDe(insumoId) : null;
    return {
      ok: true,
      mensaje: `Ingreso registrado: ${formatCantidad(cantidad, unidad ?? '')}.`,
      detalle: saldo
        ? `Saldo a granel de ${saldo.nombre} (consultado en la base): ${formatCantidad(saldo.saldo_granel, saldo.unidad_base)}.`
        : undefined,
    };
  });
}

// Alta de presentación de venta
export async function crearPresentacion(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return ejecutar(async () => {
    const nombre = texto(fd, 'nombre');
    const { error } = await rpc('crear_presentacion', {
      p_insumo_id: texto(fd, 'insumo_id'),
      p_nombre: nombre,
      p_contenido: parseNumero(texto(fd, 'contenido')),
      p_unidad: texto(fd, 'unidad'),
    });
    if (error) return { ok: false, mensaje: error.message, detalle: error.hint ?? undefined };
    revalidatePath('/');
    return { ok: true, mensaje: `Presentación "${nombre}" creada.` };
  });
}

// RF-01 · Fraccionamiento transaccional
export async function registrarFraccionamiento(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return ejecutar(async () => {
    const insumoId = texto(fd, 'insumo_id');
    const { error } = await rpc('registrar_fraccionamiento', {
      p_insumo_id: insumoId,
      p_cantidad_extraida: parseNumero(texto(fd, 'cantidad_extraida')),
      p_presentacion_id: texto(fd, 'presentacion_id'),
      p_unidades: parseNumero(texto(fd, 'unidades')),
      p_merma: parseNumero(texto(fd, 'merma')) ?? 0,
      p_observacion: texto(fd, 'observacion'),
    });
    if (error) return { ok: false, mensaje: error.message, detalle: error.hint ?? undefined };
    revalidatePath('/');
    const saldo = insumoId ? await saldoDe(insumoId) : null;
    return {
      ok: true,
      mensaje: 'Fraccionamiento confirmado: la transacción conservó las cantidades.',
      detalle: saldo
        ? `Saldo persistido de ${saldo.nombre}: granel ${formatCantidad(saldo.saldo_granel, saldo.unidad_base)} · ` +
          `presentaciones ${formatCantidad(saldo.saldo_presentaciones, saldo.unidad_base)} · ` +
          `total ${formatCantidad(saldo.saldo_total, saldo.unidad_base)}.`
        : undefined,
    };
  });
}

// RF-05 · Demostración: intenta editar o eliminar un movimiento registrado
export async function intentarAlterarMovimiento(_prev: ActionState, fd: FormData): Promise<ActionState> {
  return ejecutar(async () => {
    const [operacion, id] = (texto(fd, 'objetivo') ?? '').split(':');
    const { error } = await rpc('demo_intentar_alterar_movimiento', {
      p_movimiento_id: Number(id),
      p_operacion: operacion,
    });
    if (error) {
      return { ok: false, mensaje: `Rechazado por la base de datos: ${error.message}`, detalle: error.hint ?? undefined };
    }
    revalidatePath('/');
    return { ok: true, mensaje: `ATENCIÓN: el ${operacion} sobre el movimiento #${id} no fue bloqueado.` };
  });
}
