import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Cuentas de usuario: validación del registro y alta en Supabase Auth.
 *
 * Las contraseñas las guarda Supabase Auth con bcrypt; esta aplicación solo
 * las valida y las envía por HTTPS, nunca las guarda.
 */

export const LARGO_MINIMO_CLAVE = 8;
/** bcrypt solo considera los primeros 72 bytes: se rechaza lo que exceda. */
export const LARGO_MAXIMO_CLAVE_BYTES = 72;

export const ROLES = [
  { valor: 'OPERARIO', texto: 'Operario' },
  { valor: 'ADMINISTRADOR', texto: 'Administrador' },
] as const;

export type Rol = (typeof ROLES)[number]['valor'];

export function textoRol(rol: string): string {
  return ROLES.find((r) => r.valor === rol)?.texto ?? rol;
}

export class ErrorDeCuenta extends Error {}

const FORMATO_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Correo en minúsculas y sin espacios, o null si no es válido. */
export function normalizarCorreo(correo: string | null): string | null {
  const limpio = correo?.trim().toLowerCase() ?? '';
  return limpio.length <= 254 && FORMATO_CORREO.test(limpio) ? limpio : null;
}

/** Devuelve el motivo por el que la contraseña no sirve, o null si es válida. */
export function validarClave(clave: string | null, confirmacion: string | null): string | null {
  if (!clave || clave.length < LARGO_MINIMO_CLAVE) {
    return `La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`;
  }
  if (new TextEncoder().encode(clave).length > LARGO_MAXIMO_CLAVE_BYTES) {
    return 'La contraseña es demasiado larga (máximo 72 caracteres).';
  }
  if (clave !== confirmacion) {
    return 'Las contraseñas no coinciden.';
  }
  return null;
}

export interface DatosRegistro {
  nombre: string;
  correo: string;
  clave: string;
  rol: Rol;
}

export type Validacion<T> = { ok: true; datos: T } | { ok: false; mensaje: string };

export function validarRegistro(entrada: {
  nombre: string | null;
  correo: string | null;
  clave: string | null;
  confirmacion: string | null;
  rol: string | null;
}): Validacion<DatosRegistro> {
  const nombre = entrada.nombre?.trim().replace(/\s+/g, ' ') ?? '';
  if (nombre === '') return { ok: false, mensaje: 'Ingresa tu nombre completo.' };
  if (nombre.length > 120) return { ok: false, mensaje: 'El nombre es demasiado largo (máximo 120 caracteres).' };

  const correo = normalizarCorreo(entrada.correo);
  if (!correo) return { ok: false, mensaje: 'Ingresa un correo electrónico válido.' };

  const errorClave = validarClave(entrada.clave, entrada.confirmacion);
  if (errorClave) return { ok: false, mensaje: errorClave };

  const rol = ROLES.find((r) => r.valor === entrada.rol)?.valor;
  if (!rol) return { ok: false, mensaje: 'Selecciona un rol: Administrador u Operario.' };

  return { ok: true, datos: { nombre, correo, clave: entrada.clave!, rol } };
}

/** ¿El error de Supabase Auth indica que el correo ya está registrado? */
export function esCorreoDuplicado(error: { message?: string; code?: string } | null | undefined): boolean {
  if (!error) return false;
  return error.code === 'email_exists' || /already (been )?registered|already exists/i.test(error.message ?? '');
}

/**
 * Crea la cuenta en Supabase Auth (contraseña con bcrypt) y la deja como
 * solicitud de acceso. Si es la primera cuenta del sistema, se activa como
 * administradora. Requiere el cliente con clave de servicio.
 */
export async function registrarCuenta(
  admin: SupabaseClient,
  datos: DatosRegistro,
): Promise<{ usuarioId: string; activa: boolean }> {
  const alta = await admin.auth.admin.createUser({
    email: datos.correo,
    password: datos.clave,
    // Sin correo de confirmación: el acceso lo habilita un administrador.
    email_confirm: true,
    user_metadata: { nombre: datos.nombre, rol: datos.rol },
  });

  if (alta.error || !alta.data.user) {
    if (esCorreoDuplicado(alta.error)) {
      throw new ErrorDeCuenta('Ya existe una cuenta con ese correo electrónico. Inicia sesión o recupera tu contraseña.');
    }
    throw new Error(`No se pudo crear la cuenta: ${alta.error?.message ?? 'respuesta vacía'}`);
  }

  const usuarioId = alta.data.user.id;
  const { data, error } = await admin.rpc('activar_primera_cuenta', { p_usuario_id: usuarioId });
  if (error) throw new Error(`La cuenta se creó, pero no se pudo completar el alta: ${error.message}`);
  return { usuarioId, activa: data === true };
}
