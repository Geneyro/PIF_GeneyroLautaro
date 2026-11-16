import type { SupabaseClient } from '@supabase/supabase-js';

/*
 * Alta de usuarios desde la aplicación.
 *
 * No hay registro público: Supabase Auth tiene el registro deshabilitado.
 * Los usuarios se crean en el servidor, con la clave de servicio, en dos casos:
 *   1. Puesta en marcha: mientras no exista ningún usuario, se puede crear el
 *      primero junto con su organización.
 *   2. Después: solo un usuario con sesión puede dar de alta a otro, y siempre
 *      dentro de su propia organización.
 *
 * Estas funciones reciben el cliente de administración ya construido, para
 * poder probarlas contra una base de pruebas.
 */

export const LARGO_MINIMO_CLAVE = 8;

export interface DatosUsuario {
  nombre: string | null;
  correo: string | null;
  clave: string | null;
}

export class ErrorDeUsuario extends Error {}

function validar(datos: DatosUsuario): { nombre: string; correo: string; clave: string } {
  const nombre = datos.nombre?.trim() ?? '';
  const correo = datos.correo?.trim().toLowerCase() ?? '';
  const clave = datos.clave ?? '';
  if (nombre === '') throw new ErrorDeUsuario('El nombre es obligatorio.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo)) throw new ErrorDeUsuario('El correo no es válido.');
  if (clave.length < LARGO_MINIMO_CLAVE) {
    throw new ErrorDeUsuario(`La contraseña debe tener al menos ${LARGO_MINIMO_CLAVE} caracteres.`);
  }
  return { nombre, correo, clave };
}

/** ¿Existe al menos un usuario dado de alta en el sistema? */
export async function hayUsuarios(admin: SupabaseClient): Promise<boolean> {
  const { count, error } = await admin.from('miembro').select('usuario_id', { count: 'exact', head: true });
  if (error) throw new Error(`No se pudo consultar los usuarios: ${error.message}`);
  return (count ?? 0) > 0;
}

/** Crea un usuario (ya confirmado) y lo asocia a la organización indicada. */
export async function crearUsuario(admin: SupabaseClient, organizacionId: string, datos: DatosUsuario): Promise<string> {
  const { nombre, correo, clave } = validar(datos);

  const alta = await admin.auth.admin.createUser({ email: correo, password: clave, email_confirm: true });
  if (alta.error || !alta.data.user) {
    const yaExiste = /already|registered|exists/i.test(alta.error?.message ?? '');
    throw new ErrorDeUsuario(yaExiste ? 'Ya existe un usuario con ese correo.' : `No se pudo crear el usuario: ${alta.error?.message}`);
  }
  const usuarioId = alta.data.user.id;

  const miembro = await admin.from('miembro').insert({ usuario_id: usuarioId, organizacion_id: organizacionId, nombre });
  if (miembro.error) {
    // Sin organización el usuario no podría operar: se deshace el alta.
    await admin.auth.admin.deleteUser(usuarioId);
    throw new Error(`No se pudo asociar el usuario a la organización: ${miembro.error.message}`);
  }
  return usuarioId;
}

/** Puesta en marcha: crea la organización y su primer usuario. Solo si no hay ninguno. */
export async function crearPrimerUsuario(
  admin: SupabaseClient,
  nombreOrganizacion: string | null,
  datos: DatosUsuario,
): Promise<string> {
  const organizacion = nombreOrganizacion?.trim() ?? '';
  if (organizacion === '') throw new ErrorDeUsuario('El nombre de la organización es obligatorio.');
  validar(datos);

  if (await hayUsuarios(admin)) {
    throw new ErrorDeUsuario('El sistema ya tiene usuarios. Pedile a uno de ellos que te dé de alta.');
  }

  const org = await admin.from('organizacion').insert({ nombre: organizacion }).select('id').single();
  if (org.error || !org.data) throw new Error(`No se pudo crear la organización: ${org.error?.message}`);

  try {
    return await crearUsuario(admin, org.data.id as string, datos);
  } catch (e) {
    await admin.from('organizacion').delete().eq('id', org.data.id);
    throw e;
  }
}
