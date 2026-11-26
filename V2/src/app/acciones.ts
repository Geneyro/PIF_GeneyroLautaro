'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { normalizarCorreo, registrarCuenta, validarClave, validarRegistro } from '@/lib/cuentas';
import { formatBase, formatCantidad, leerEnteroNoNegativo, leerEnteroPositivo } from '@/lib/formato';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Estado, SaldoInsumo } from '@/lib/tipos';

/*
 * Server Actions. Se ejecutan solo en el servidor, con la sesión del usuario,
 * y delegan TODA regla de negocio en las funciones PL/pgSQL: acá solo se leen
 * los campos del formulario. Si la base rechaza la operación, la pantalla
 * muestra su mensaje sin detalles técnicos.
 */

function texto(fd: FormData, campo: string): string | null {
  const v = fd.get(campo);
  return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
}

/** Valor tal cual se escribió (las contraseñas no se recortan). */
function crudo(fd: FormData, campo: string): string | null {
  const v = fd.get(campo);
  return typeof v === 'string' && v !== '' ? v : null;
}

type ErrorBase = { message: string; hint?: string | null };

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

/**
 * Dirección pública de la aplicación (producción o vista previa), para armar
 * los enlaces de vuelta. Supabase solo acepta las direcciones de su lista
 * permitida, así que un encabezado falsificado no puede desviar el enlace.
 */
function origenDeLaPeticion(): string {
  const h = headers();
  const origen = h.get('origin');
  if (origen) return origen;
  const host = h.get('x-forwarded-host') ?? h.get('host') ?? 'localhost:3100';
  const protocolo = h.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${protocolo}://${host}`;
}

// =============================================================================
// Sesión y cuentas (RF-23)
// =============================================================================

export async function iniciarSesion(_previo: Estado, fd: FormData): Promise<Estado> {
  const resultado = await ejecutar(async () => {
    const correo = normalizarCorreo(texto(fd, 'correo'));
    const clave = crudo(fd, 'clave');
    if (!correo || !clave) {
      return { ok: false, mensaje: 'Ingresa tu correo electrónico y tu contraseña.' };
    }
    const { error } = await crearClienteServidor().auth.signInWithPassword({ email: correo, password: clave });
    if (error) {
      if (error.code === 'email_not_confirmed') {
        return { ok: false, mensaje: 'Tu correo electrónico todavía no está confirmado.' };
      }
      return { ok: false, mensaje: 'Correo electrónico o contraseña incorrectos.' };
    }
    return { ok: true, mensaje: '' };
  });
  if (resultado?.ok) redirect('/');
  return resultado;
}

export async function cerrarSesion(): Promise<void> {
  await crearClienteServidor().auth.signOut();
  redirect('/login');
}

/**
 * Registro. La cuenta queda pendiente hasta que un administrador la apruebe;
 * si es la primera del sistema, entra directamente como administradora.
 */
export async function crearCuenta(_previo: Estado, fd: FormData): Promise<Estado> {
  const validacion = validarRegistro({
    nombre: texto(fd, 'nombre'),
    correo: texto(fd, 'correo'),
    clave: crudo(fd, 'clave'),
    confirmacion: crudo(fd, 'confirmacion'),
    rol: texto(fd, 'rol'),
  });
  if (!validacion.ok) return { ok: false, mensaje: validacion.mensaje };
  const datos = validacion.datos;

  const resultado = await ejecutar(async () => {
    await registrarCuenta(crearClienteAdmin(), datos);
    const { error } = await crearClienteServidor().auth.signInWithPassword({
      email: datos.correo,
      password: datos.clave,
    });
    if (error) return { ok: true, mensaje: 'Cuenta creada. Ya puedes iniciar sesión.' };
    return { ok: true, mensaje: '' };
  });
  if (resultado?.ok && resultado.mensaje === '') redirect('/');
  return resultado;
}

/** Envía el correo con el enlace seguro para restablecer la contraseña. */
export async function solicitarRecuperacion(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const correo = normalizarCorreo(texto(fd, 'correo'));
    if (!correo) return { ok: false, mensaje: 'Ingresa un correo electrónico válido.' };

    const { error } = await crearClienteServidor().auth.resetPasswordForEmail(correo, {
      redirectTo: `${origenDeLaPeticion()}/auth/callback?next=/restablecer`,
    });
    if (error?.status === 429) {
      return {
        ok: false,
        mensaje: 'Se enviaron demasiados correos en poco tiempo. Espera unos minutos y vuelve a intentarlo.',
      };
    }
    if (error) return { ok: false, mensaje: 'No se pudo enviar el correo. Inténtalo de nuevo más tarde.' };

    // Mismo mensaje exista o no la cuenta: no se revela qué correos están registrados.
    return {
      ok: true,
      mensaje: 'Si el correo está registrado, te enviamos un enlace para restablecer la contraseña.',
      detalle: 'Revisa tu bandeja de entrada y la carpeta de correo no deseado. El enlace vence en una hora.',
    };
  });
}

/** Guarda la contraseña nueva (sesión abierta por el enlace del correo). */
export async function restablecerClave(_previo: Estado, fd: FormData): Promise<Estado> {
  const clave = crudo(fd, 'clave');
  const errorClave = validarClave(clave, crudo(fd, 'confirmacion'));
  if (errorClave) return { ok: false, mensaje: errorClave };

  const resultado = await ejecutar(async () => {
    const { error } = await crearClienteServidor().auth.updateUser({ password: clave! });
    if (error?.code === 'same_password') {
      return { ok: false, mensaje: 'La contraseña nueva debe ser distinta de la anterior.' };
    }
    if (error) return { ok: false, mensaje: `No se pudo cambiar la contraseña: ${error.message}` };
    return { ok: true, mensaje: '' };
  });
  if (resultado?.ok) redirect('/');
  return resultado;
}

/** Lista de enteros positivos de un campo repetido; null si alguno no lo es. */
function enteros(fd: FormData, campo: string): number[] | null {
  const valores = fd.getAll(campo).map((v) => (typeof v === 'string' ? leerEnteroPositivo(v) : null));
  return valores.every((v): v is number => v !== null) ? valores : null;
}

function textos(fd: FormData, campo: string): string[] {
  return fd.getAll(campo).map((v) => (typeof v === 'string' ? v.trim() : ''));
}

/**
 * Las funciones de la base ya devuelven mensajes pensados para el usuario.
 * Lo que no lo sea (una restricción, un fallo de red) se reemplaza por un
 * mensaje general: la pantalla nunca muestra detalles técnicos.
 */
function mensajeAmigable(error: ErrorBase & { code?: string }): Estado {
  const tecnico = /violates|constraint|operación [0-9a-f-]{36}|syntax|function|column|relation|permission|null value/i;
  const propio = ['P0001', 'P0002', '22023', '23505', '42501'].includes(error.code ?? '') && !tecnico.test(error.message);
  return {
    ok: false,
    mensaje: propio ? error.message : 'No se pudo registrar la operación. Revisá los datos e intentá de nuevo.',
  };
}

// =============================================================================
// Motor de Fraccionamiento
// =============================================================================

export async function fraccionar(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const insumoId = texto(fd, 'insumo_id');
    const presentaciones = textos(fd, 'presentacion_id');
    const unidades = enteros(fd, 'unidades');
    if (!insumoId) return { ok: false, mensaje: 'Seleccioná el insumo a granel de origen.' };
    if (!unidades || unidades.length === 0 || presentaciones.some((p) => p === '')) {
      return { ok: false, mensaje: 'Cada presentación necesita una cantidad entera de unidades, mayor que 0.' };
    }
    const { error } = await crearClienteServidor().rpc('fraccionar', {
      p_insumo_id: insumoId,
      p_presentaciones: presentaciones,
      p_unidades: unidades,
      p_observacion: texto(fd, 'observacion'),
    });
    if (error) return mensajeAmigable(error);
    revalidatePath('/', 'layout');
    const saldo = await saldoDe(insumoId);
    return {
      ok: true,
      mensaje: 'Fraccionamiento registrado.',
      detalle: saldo ? `${saldo.nombre}: quedan ${formatCantidad(saldo.saldo_granel, saldo.unidad_base)} a granel.` : undefined,
    };
  });
}

// =============================================================================
// Insumos · conteo físico
// =============================================================================

export async function registrarConteo(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const insumoId = texto(fd, 'insumo_id');
    const escrito = texto(fd, 'conteo');
    const conteo = escrito === null ? null : leerEnteroNoNegativo(escrito);
    if (!insumoId || conteo === null) {
      return { ok: false, mensaje: 'Ingresá el conteo físico como un número entero.' };
    }
    const { data, error } = await crearClienteServidor().rpc('registrar_conteo', {
      p_insumo_id: insumoId,
      p_conteo: conteo,
      p_observacion: texto(fd, 'observacion'),
    });
    if (error) return mensajeAmigable(error);
    revalidatePath('/', 'layout');
    const saldo = await saldoDe(insumoId);
    const diferencia = Number(data ?? 0);
    const unidad = saldo?.unidad_base ?? 'mL';
    return {
      ok: true,
      mensaje:
        diferencia === 0
          ? 'Conteo registrado: coincide con el sistema.'
          : `Stock ajustado ${diferencia > 0 ? '+' : ''}${formatBase(diferencia, unidad)}.`,
    };
  });
}

// =============================================================================
// Servicios
// =============================================================================

export async function registrarServicio(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const nombre = texto(fd, 'nombre');
    const vehiculo = texto(fd, 'vehiculo');
    const insumos = textos(fd, 'insumo_id');
    const cantidades = enteros(fd, 'cantidad');
    if (!nombre) return { ok: false, mensaje: 'Ingresá el nombre del servicio.' };
    if (!vehiculo) return { ok: false, mensaje: 'Ingresá el tipo de vehículo.' };
    if (insumos.length === 0 || insumos.some((i) => i === '')) {
      return { ok: false, mensaje: 'Elegí el insumo de cada línea de la receta.' };
    }
    if (!cantidades || cantidades.length !== insumos.length) {
      return { ok: false, mensaje: 'Cada insumo de la receta necesita una cantidad entera, mayor que 0.' };
    }
    const { error } = await crearClienteServidor().rpc('registrar_servicio', {
      p_nombre: nombre,
      p_tipo_vehiculo: vehiculo,
      p_insumos: insumos,
      p_cantidades: cantidades,
      p_observacion: texto(fd, 'observacion'),
    });
    if (error) return mensajeAmigable(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: `Servicio «${nombre}» registrado y descontado del stock.` };
  });
}

// =============================================================================
// Insumos · alta y baja
// =============================================================================

export async function agregarInsumo(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const nombre = texto(fd, 'nombre');
    const unidad = texto(fd, 'unidad_base') ?? 'mL';
    if (!nombre) return { ok: false, mensaje: 'Ingresá el nombre del insumo.' };
    const { error } = await crearClienteServidor().rpc('agregar_insumo', { p_nombre: nombre, p_unidad_base: unidad });
    if (error) return mensajeAmigable(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: `Insumo «${nombre}» agregado con presentaciones de 1, 5, 20, 60 y 120 L.` };
  });
}

// =============================================================================
// Insumos · punto de pedido y eliminación
// =============================================================================

export async function definirPuntoPedido(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const escrito = texto(fd, 'punto');
    const punto = escrito === null ? null : leerEnteroPositivo(escrito);
    if (escrito !== null && punto === null) {
      return { ok: false, mensaje: 'El punto de pedido es un número entero mayor que 0 (o vacío para quitarlo).' };
    }
    const { error } = await crearClienteServidor().rpc('definir_punto_pedido', {
      p_insumo_id: texto(fd, 'insumo_id'),
      p_punto: punto,
    });
    if (error) return mensajeAmigable(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: punto === null ? 'Punto de pedido quitado.' : 'Punto de pedido guardado.' };
  });
}

export async function cambiarEstadoInsumo(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const activo = texto(fd, 'activo') === 'true';
    const { error } = await crearClienteServidor().rpc('cambiar_estado_insumo', {
      p_insumo_id: texto(fd, 'insumo_id'),
      p_activo: activo,
    });
    if (error) return mensajeAmigable(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: activo ? 'Insumo reactivado.' : 'Insumo eliminado. Su historial se conserva.' };
  });
}

// =============================================================================
// RF-05 · Corrección por compensación
// =============================================================================

export async function compensarOperacion(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const { error } = await crearClienteServidor().rpc('compensar_operacion', {
      p_operacion_id: texto(fd, 'operacion_id'),
      p_motivo: texto(fd, 'motivo'),
    });
    if (error) return mensajeAmigable(error);
    revalidatePath('/', 'layout');
    return { ok: true, mensaje: 'Operación anulada: la corrección quedó registrada en el historial.' };
  });
}
