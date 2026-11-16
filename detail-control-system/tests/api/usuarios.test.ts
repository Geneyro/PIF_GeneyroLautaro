import { createClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';
import { crearPrimerUsuario, crearUsuario, hayUsuarios } from '@/lib/usuarios';

/*
 * Alta de usuarios desde la aplicación, contra Supabase Auth real (local del CI).
 * Requiere además PRUEBAS_SUPABASE_SERVICE_ROLE_KEY. Nunca apuntar a producción.
 */

const URL = process.env.PRUEBAS_SUPABASE_URL;
const CLAVE = process.env.PRUEBAS_SUPABASE_ANON_KEY;
const SERVICIO = process.env.PRUEBAS_SUPABASE_SERVICE_ROLE_KEY;
const ORG_B = '0b000000-0000-4000-8000-000000000002';

const sinSesion = { auth: { persistSession: false, autoRefreshToken: false } };

describe.skipIf(!URL || !CLAVE || !SERVICIO)('API real · alta de usuarios sin registro público', () => {
  const admin = () => createClient(URL!, SERVICIO!, sinSesion);
  const correo = `nuevo${Date.now()}@otra.test`;

  it('un usuario dado de alta puede iniciar sesión y operar en su organización', async () => {
    const id = await crearUsuario(admin(), ORG_B, { nombre: 'Nuevo', correo, clave: 'clave-de-prueba-1' });

    const cliente = createClient(URL!, CLAVE!, sinSesion);
    const ingreso = await cliente.auth.signInWithPassword({ email: correo, password: 'clave-de-prueba-1' });
    expect(ingreso.error).toBeNull();
    expect(ingreso.data.user?.id).toBe(id);

    const alta = await cliente.rpc('crear_insumo', { p_nombre: `Insumo de ${correo}`, p_unidad_base: 'mL', p_presentaciones: [5] });
    expect(alta.error).toBeNull();
    const propio = await cliente.from('insumo').select('organizacion_id, creado_por').eq('id', alta.data).single();
    expect(propio.data).toEqual({ organizacion_id: ORG_B, creado_por: id });
  });

  it('rechaza correo repetido, correo inválido, contraseña corta y nombre vacío', async () => {
    const intento = (datos: { nombre: string; correo: string; clave: string }) => crearUsuario(admin(), ORG_B, datos);
    await expect(intento({ nombre: 'Otro', correo, clave: 'clave-de-prueba-2' })).rejects.toThrow(/Ya existe un usuario/);
    await expect(intento({ nombre: 'Otro', correo: 'sin-arroba', clave: 'clave-de-prueba-2' })).rejects.toThrow(/correo no es válido/);
    await expect(intento({ nombre: 'Otro', correo: `corta${Date.now()}@otra.test`, clave: '1234567' })).rejects.toThrow(/al menos 8/);
    await expect(intento({ nombre: '  ', correo: `vacio${Date.now()}@otra.test`, clave: 'clave-de-prueba-2' })).rejects.toThrow(/nombre es obligatorio/);
  });

  it('si la asociación a la organización falla, no queda un usuario suelto', async () => {
    const huerfano = `huerfano${Date.now()}@otra.test`;
    await expect(
      crearUsuario(admin(), '99999999-9999-4999-8999-999999999999', { nombre: 'Huérfano', correo: huerfano, clave: 'clave-de-prueba-3' }),
    ).rejects.toThrow(/No se pudo asociar/);
    const ingreso = await createClient(URL!, CLAVE!, sinSesion).auth.signInWithPassword({ email: huerfano, password: 'clave-de-prueba-3' });
    expect(ingreso.data.session).toBeNull();
  });

  it('la puesta en marcha se cierra en cuanto existe un usuario', async () => {
    expect(await hayUsuarios(admin())).toBe(true);
    await expect(
      crearPrimerUsuario(admin(), 'Organización intrusa', { nombre: 'Intruso', correo: `intruso${Date.now()}@otra.test`, clave: 'clave-de-prueba-4' }),
    ).rejects.toThrow(/ya tiene usuarios/);
    const orgs = await admin().from('organizacion').select('id').eq('nombre', 'Organización intrusa');
    expect(orgs.data).toEqual([]);
  });
});
