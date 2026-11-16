'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { formatCantidad, leerEnteroNoNegativo, leerEnteroPositivo, pesosACentavos } from '@/lib/formato';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Estado, SaldoInsumo } from '@/lib/tipos';

/*
 * Server Actions. Se ejecutan en el servidor con la sesión del usuario y
 * delegan TODA regla de negocio en las funciones PL/pgSQL: acá solo se leen
 * los campos del formulario. Si la base rechaza la operación, su mensaje se
 * devuelve tal cual a la pantalla.
 */

function texto(fd: FormData, campo: string): string | null {
  const v = fd.get(campo);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

type ErrorBase = { message: string; hint?: string | null };

function rechazo(error: ErrorBase): Estado {
  return { ok: false, mensaje: error.message, detalle: error.hint ?? undefined };
}

async function ejecutar(accion: () => Promise<Estado>): Promise<Estado> {
  try {
    return await accion();
  } catch (e) {
    return { ok: false, mensaje: e instanceof Error ? e.message : 'Error inesperado.' };
  }
}

async function saldoDe(insumoId: string): Promise<SaldoInsumo | null> {
  const { data } = await crearClienteServidor()
    .from('v_saldo_insumo')
    .select('*')
    .eq('insumo_id', insumoId)
    .maybeSingle();
  return (data as SaldoInsumo | null) ?? null;
}

// --- RF-23 · Sesión -----------------------------------------------------------

export async function iniciarSesion(_previo: Estado, fd: FormData): Promise<Estado> {
  const resultado = await ejecutar(async () => {
    const correo = texto(fd, 'correo');
    const clave = fd.get('clave');
    if (!correo || typeof clave !== 'string' || clave === '') {
      return { ok: false, mensaje: 'Ingresá tu correo y tu contraseña.' };
    }
    const { error } = await crearClienteServidor().auth.signInWithPassword({ email: correo, password: clave });
    if (error) return { ok: false, mensaje: 'Correo o contraseña incorrectos.' };
    return { ok: true, mensaje: '' };
  });
  if (resultado?.ok) redirect('/');
  return resultado;
}

export async function cerrarSesion(): Promise<void> {
  await crearClienteServidor().auth.signOut();
  redirect('/login');
}

// --- RF-02 · Alta de insumo con presentaciones --------------------------------

export async function crearInsumo(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const nombre = texto(fd, 'nombre');
    const unidadBase = texto(fd, 'unidad_base');
    const presentaciones = fd.getAll('presentaciones').map((v) => Number(v));
    const { error } = await crearClienteServidor().rpc('crear_insumo', {
      p_nombre: nombre,
      p_unidad_base: unidadBase,
      p_presentaciones: presentaciones,
    });
    if (error) return rechazo(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: `Insumo «${nombre}» dado de alta en ${unidadBase}.` };
  });
}

export async function agregarPresentacion(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const { error } = await crearClienteServidor().rpc('agregar_presentacion', {
      p_insumo_id: texto(fd, 'insumo_id'),
      p_tamano: leerEnteroPositivo(texto(fd, 'tamano')),
    });
    if (error) return rechazo(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: 'Presentación agregada.' };
  });
}

// --- RF-03 · Ingreso ------------------------------------------------------------

export async function registrarIngreso(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const insumoId = texto(fd, 'insumo_id');
    const cantidad = leerEnteroPositivo(texto(fd, 'cantidad'));
    if (cantidad === null) {
      return { ok: false, mensaje: 'La cantidad debe ser un número entero mayor que 0 (sin decimales).' };
    }
    const costoTexto = texto(fd, 'costo');
    const costo = pesosACentavos(costoTexto);
    if (costoTexto !== null && costo === null) {
      return { ok: false, mensaje: 'El costo no es un importe válido. Ejemplos: 2400000 · 2.400.000 · 2400,50' };
    }
    const { error } = await crearClienteServidor().rpc('registrar_ingreso', {
      p_insumo_id: insumoId,
      p_cantidad: cantidad,
      p_unidad: texto(fd, 'unidad'),
      p_proveedor: texto(fd, 'proveedor'),
      p_costo_centavos: costo,
      p_observacion: texto(fd, 'observacion'),
    });
    if (error) return rechazo(error);
    revalidatePath('/', 'layout');
    const saldo = insumoId ? await saldoDe(insumoId) : null;
    return {
      ok: true,
      mensaje: 'Ingreso registrado.',
      detalle: saldo ? `Saldo de ${saldo.nombre}: ${formatCantidad(saldo.saldo_total, saldo.unidad_base)}.` : undefined,
    };
  });
}

// --- RF-01 / RF-06 · Fraccionamiento --------------------------------------------

export async function registrarFraccionamiento(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const insumoId = texto(fd, 'insumo_id');
    const cantidad = leerEnteroPositivo(texto(fd, 'cantidad_origen'));
    const unidades = leerEnteroPositivo(texto(fd, 'unidades'));
    const merma = leerEnteroNoNegativo(texto(fd, 'merma'));
    if (cantidad === null || unidades === null || merma === null) {
      return { ok: false, mensaje: 'Cantidad, unidades y merma deben ser números enteros (sin decimales).' };
    }
    // La cantidad puede cargarse en L/kg: se pasa a unidad base con enteros.
    const enMayor = ['L', 'kg'].includes(texto(fd, 'unidad_origen') ?? '');
    const { error } = await crearClienteServidor().rpc('registrar_fraccionamiento', {
      p_insumo_id: insumoId,
      p_cantidad_origen: enMayor ? cantidad * 1000 : cantidad,
      p_presentacion_id: texto(fd, 'presentacion_id'),
      p_unidades: unidades,
      p_merma: merma,
      p_motivo_merma: texto(fd, 'motivo_merma'),
      p_observacion: texto(fd, 'observacion'),
    });
    if (error) return rechazo(error);
    revalidatePath('/', 'layout');
    const saldo = insumoId ? await saldoDe(insumoId) : null;
    return {
      ok: true,
      mensaje: 'Fraccionamiento confirmado: las cantidades se conservan.',
      detalle: saldo
        ? `${saldo.nombre}: a granel ${formatCantidad(saldo.saldo_granel, saldo.unidad_base)} · ` +
          `fraccionado ${formatCantidad(saldo.saldo_fraccionado, saldo.unidad_base)}.`
        : undefined,
    };
  });
}

// --- RF-05 · Corrección por compensación ----------------------------------------

export async function compensarOperacion(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const { error } = await crearClienteServidor().rpc('compensar_operacion', {
      p_operacion_id: texto(fd, 'operacion_id'),
      p_motivo: texto(fd, 'motivo'),
    });
    if (error) return rechazo(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: 'Corrección registrada como movimiento de compensación.' };
  });
}
