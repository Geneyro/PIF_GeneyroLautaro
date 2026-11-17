import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { registrarCuenta } from '@/lib/cuentas';

/*
 * Registro, aprobación y recuperación de contraseña contra Supabase Auth real
 * (el Supabase local que levanta la integración continua).
 * Requiere PRUEBAS_SUPABASE_URL, PRUEBAS_SUPABASE_ANON_KEY y
 * PRUEBAS_SUPABASE_SERVICE_ROLE_KEY. Nunca apuntar a producción.
 */

const URL = process.env.PRUEBAS_SUPABASE_URL;
const CLAVE = process.env.PRUEBAS_SUPABASE_ANON_KEY;
const SERVICIO = process.env.PRUEBAS_SUPABASE_SERVICE_ROLE_KEY;
const CONTRASENA_SEED = 'detail-control-pruebas';

const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };

async function sesion(correo: string, clave: string): Promise<SupabaseClient> {
  const c = createClient(URL!, CLAVE!, sinSesion);
  const { error } = await c.auth.signInWithPassword({ email: correo, password: clave });
  if (error) throw new Error(`No se pudo iniciar sesión como ${correo}: ${error.message}`);
  return c;
}

describe.skipIf(!URL || !CLAVE || !SERVICIO)('API real · registro, aprobación y recuperación', () => {
  const admin = () => createClient(URL!, SERVICIO!, sinSesion);
  const correo = `registro${Date.now()}@pruebas.test`;
  const clave = 'clave-segura-de-prueba';
  let usuarioId = '';

  it('«Crear cuenta» crea la cuenta pendiente: inicia sesión, pero no ve ni opera datos', async () => {
    const r = await registrarCuenta(admin(), { nombre: 'Persona Nueva', correo, clave, rol: 'ADMINISTRADOR' });
    usuarioId = r.usuarioId;
    // Ya hay usuarios (datos de prueba): no se activa sola.
    expect(r.activa).toBe(false);

    const nueva = await sesion(correo, clave);
    const insumos = await nueva.from('insumo').select('id');
    expect(insumos.data).toEqual([]);
    const intento = await nueva.rpc('crear_insumo', { p_nombre: 'No debería', p_unidad_base: 'mL', p_presentaciones: [1] });
    expect(intento.error?.message).toMatch(/no pertenece a ninguna organización/);
  });

  it('un correo ya registrado se rechaza con un mensaje claro', async () => {
    await expect(registrarCuenta(admin(), { nombre: 'Otra', correo, clave, rol: 'OPERARIO' })).rejects.toThrow(
      /Ya existe una cuenta con ese correo electrónico/,
    );
    await expect(
      registrarCuenta(admin(), { nombre: 'Yanina 2', correo: 'yanina@gfk.test', clave, rol: 'OPERARIO' }),
    ).rejects.toThrow(/Ya existe una cuenta/);
  });

  it('un operario no puede aprobar; la administradora aprueba con el rol que elige', async () => {
    const guido = await sesion('guido@gfk.test', CONTRASENA_SEED);
    expect((await guido.from('solicitud_acceso').select('usuario_id')).data).toEqual([]);
    const intento = await guido.rpc('aprobar_solicitud', { p_usuario_id: usuarioId, p_rol: 'OPERARIO' });
    expect(intento.error?.message).toMatch(/Solo un administrador/);

    const yanina = await sesion('yanina@gfk.test', CONTRASENA_SEED);
    const pendientes = await yanina.from('solicitud_acceso').select('usuario_id, nombre, correo, rol_solicitado');
    expect(pendientes.data).toContainEqual({
      usuario_id: usuarioId,
      nombre: 'Persona Nueva',
      correo,
      rol_solicitado: 'ADMINISTRADOR',
    });
    const aprobacion = await yanina.rpc('aprobar_solicitud', { p_usuario_id: usuarioId, p_rol: 'OPERARIO' });
    expect(aprobacion.error).toBeNull();

    const nueva = await sesion(correo, clave);
    const yo = await nueva.from('miembro').select('nombre, rol').eq('usuario_id', usuarioId).single();
    expect(yo.data).toEqual({ nombre: 'Persona Nueva', rol: 'OPERARIO' });
    const alta = await nueva.rpc('crear_insumo', {
      p_nombre: `Insumo de ${correo}`,
      p_unidad_base: 'mL',
      p_presentaciones: [5],
    });
    expect(alta.error).toBeNull();
  });

  it('la puesta en marcha no actúa cuando ya hay usuarios, y la API pública no puede invocarla', async () => {
    const { data } = await admin().rpc('activar_primera_cuenta', { p_usuario_id: usuarioId });
    expect(data).toBe(false);
    const anonimo = createClient(URL!, CLAVE!, sinSesion);
    const intento = await anonimo.rpc('activar_primera_cuenta', { p_usuario_id: usuarioId });
    expect(intento.error).not.toBeNull();
  });

  it('la recuperación de contraseña se solicita sin revelar si el correo existe', async () => {
    const cliente = createClient(URL!, CLAVE!, sinSesion);
    const existente = await cliente.auth.resetPasswordForEmail(correo, { redirectTo: 'http://localhost:3100/auth/callback?next=/restablecer' });
    expect(existente.error).toBeNull();
    const inexistente = await cliente.auth.resetPasswordForEmail(`nadie${Date.now()}@pruebas.test`);
    expect(inexistente.error).toBeNull();
  });

  it('la contraseña cambiada reemplaza a la anterior', async () => {
    const nueva = await sesion(correo, clave);
    const cambio = await nueva.auth.updateUser({ password: 'otra-clave-segura' });
    expect(cambio.error).toBeNull();
    const vieja = await createClient(URL!, CLAVE!, sinSesion).auth.signInWithPassword({ email: correo, password: clave });
    expect(vieja.error).not.toBeNull();
    await sesion(correo, 'otra-clave-segura');
  });
});
