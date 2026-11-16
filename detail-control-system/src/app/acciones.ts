'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { normalizarCorreo, registrarCuenta, validarClave, validarRegistro } from '@/lib/cuentas';
import { formatCantidad, leerEnteroNoNegativo, leerEnteroPositivo, pesosACentavos } from '@/lib/formato';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { entornoSupabase } from '@/lib/supabase/entorno';
import { crearClienteServidor } from '@/lib/supabase/servidor';
import type { Estado, SaldoInsumo } from '@/lib/tipos';

/*
 * Server Actions. Se ejecutan solo en el servidor, con la sesión del usuario,
 * y delegan TODA regla de negocio en las funciones PL/pgSQL: acá solo se leen
 * los campos del formulario. Si la base rechaza la operación, su mensaje se
 * devuelve tal cual a la pantalla.
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

/** ¿Está habilitado el proveedor Google en Supabase Auth? */
async function googleHabilitado(): Promise<boolean> {
  const entorno = entornoSupabase();
  if (!entorno) return false;
  try {
    const respuesta = await fetch(`${entorno.url}/auth/v1/settings`, {
      headers: { apikey: entorno.clave },
      cache: 'no-store',
    });
    if (!respuesta.ok) return false;
    const ajustes = (await respuesta.json()) as { external?: { google?: boolean } };
    return ajustes.external?.google === true;
  } catch {
    return false;
  }
}

/**
 * «Continuar con Google». Si el correo no tiene cuenta, Supabase la crea y
 * queda como solicitud de acceso, igual que una cuenta del formulario.
 */
export async function continuarConGoogle(): Promise<void> {
  if (!(await googleHabilitado())) redirect('/login?error=google-no-configurado');
  const { data, error } = await crearClienteServidor().auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origenDeLaPeticion()}/auth/callback` },
  });
  if (error || !data.url) redirect('/login?error=google');
  redirect(data.url);
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

/** Un administrador aprueba (con el rol elegido) o rechaza una solicitud de acceso. */
export async function resolverSolicitud(_previo: Estado, fd: FormData): Promise<Estado> {
  return ejecutar(async () => {
    const usuarioId = texto(fd, 'usuario_id');
    const decision = texto(fd, 'decision');
    const supabase = crearClienteServidor();

    if (decision === 'rechazar') {
      const { error } = await supabase.rpc('rechazar_solicitud', { p_usuario_id: usuarioId });
      if (error) return rechazo(error);
      revalidatePath('/usuarios');
      return { ok: true, mensaje: 'Solicitud rechazada. La cuenta no tiene acceso.' };
    }

    const { error } = await supabase.rpc('aprobar_solicitud', { p_usuario_id: usuarioId, p_rol: texto(fd, 'rol') });
    if (error) return rechazo(error);
    revalidatePath('/usuarios');
    return { ok: true, mensaje: 'Cuenta aprobada. Ya puede operar.' };
  });
}

// =============================================================================
// RF-02 · Alta de insumo con presentaciones
// =============================================================================

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

// =============================================================================
// RF-03 · Ingreso
// =============================================================================

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

// =============================================================================
// RF-01 / RF-06 · Fraccionamiento
// =============================================================================

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

// =============================================================================
// RF-05 · Corrección por compensación
// =============================================================================

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
