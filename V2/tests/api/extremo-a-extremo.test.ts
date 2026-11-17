import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { describe, expect, it } from 'vitest';

/*
 * Pruebas de punta a punta contra la API real de Supabase (Auth + PostgREST),
 * con los usuarios de prueba de supabase/seed.sql.
 *
 * Solo corren si están definidas PRUEBAS_SUPABASE_URL y PRUEBAS_SUPABASE_ANON_KEY
 * (lo hace la integración continua, contra el Supabase local que levanta).
 * Nunca deben apuntar a producción: registran movimientos, que son inmutables.
 */

const URL = process.env.PRUEBAS_SUPABASE_URL;
const CLAVE = process.env.PRUEBAS_SUPABASE_ANON_KEY;
const CONTRASENA = 'detail-control-pruebas';

const YANINA = '11111111-1111-4111-8111-111111111111';
const GUIDO = '22222222-2222-4222-8222-222222222222';

function cliente(): SupabaseClient {
  return createClient(URL!, CLAVE!, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function sesion(correo: string): Promise<SupabaseClient> {
  const c = cliente();
  const { error } = await c.auth.signInWithPassword({ email: correo, password: CONTRASENA });
  if (error) throw new Error(`No se pudo iniciar sesión como ${correo}: ${error.message}`);
  return c;
}

describe.skipIf(!URL || !CLAVE)('API real · caso del bidón de 5 L con los dos usuarios', () => {
  const nombre = `Prueba bidón ${Date.now()}`;

  it('sin sesión, la API rechaza lecturas y operaciones (RF-23)', async () => {
    const anonimo = cliente();
    for (const objeto of ['insumo', 'movimiento', 'v_saldo_insumo', 'v_movimiento']) {
      const { data, error } = await anonimo.from(objeto).select('*').limit(1);
      expect(data, objeto).toBeNull();
      expect(error, objeto).not.toBeNull();
    }
    const { error } = await anonimo.rpc('crear_insumo', { p_nombre: nombre, p_unidad_base: 'mL', p_presentaciones: [1] });
    expect(error).not.toBeNull();
  });

  it('no hay registro público: nadie puede crearse un usuario', async () => {
    const { data, error } = await cliente().auth.signUp({ email: `intruso${Date.now()}@otra.test`, password: 'Una-clave-larga-123' });
    expect(error).not.toBeNull();
    expect(data.user).toBeNull();
  });

  it('una contraseña incorrecta no inicia sesión', async () => {
    const { data, error } = await cliente().auth.signInWithPassword({ email: 'yanina@gfk.test', password: 'incorrecta' });
    expect(error).not.toBeNull();
    expect(data.session).toBeNull();
  });

  it('Yanina da de alta e ingresa; Guido fracciona; cada movimiento queda atribuido', async () => {
    const yanina = await sesion('yanina@gfk.test');
    const guido = await sesion('guido@gfk.test');

    // RF-02 · alta con presentación de 1 L = 1.000 mL
    const alta = await yanina.rpc('crear_insumo', { p_nombre: nombre, p_unidad_base: 'mL', p_presentaciones: [1] });
    expect(alta.error).toBeNull();
    const insumoId = alta.data as string;
    const pres = await yanina.from('presentacion').select('id, capacidad_base').eq('insumo_id', insumoId).single();
    expect(pres.data?.capacidad_base).toBe(1000);

    // RF-03 · bidón de 5 L = 5.000 mL
    const ingreso = await yanina.rpc('registrar_ingreso', {
      p_insumo_id: insumoId,
      p_cantidad: 5,
      p_unidad: 'L',
      p_proveedor: 'Química Eldorado',
      p_costo_centavos: 1_200_000,
    });
    expect(ingreso.error).toBeNull();

    // RF-01 · en 4 botellas sin merma: rechazado, con la cantidad no explicada
    const fraccionar = (c: SupabaseClient, unidades: number) =>
      c.rpc('registrar_fraccionamiento', {
        p_insumo_id: insumoId,
        p_cantidad_origen: 5000,
        p_presentacion_id: pres.data!.id,
        p_unidades: unidades,
      });
    const rechazado = await fraccionar(guido, 4);
    expect(rechazado.error?.message).toMatch(/hay 1000 mL no explicados/);

    // RF-01 · en 5 botellas: confirmado, granel en 0
    const confirmado = await fraccionar(guido, 5);
    expect(confirmado.error).toBeNull();

    // RF-04 · saldo = suma de movimientos
    const saldo = await yanina.from('v_saldo_insumo').select('*').eq('insumo_id', insumoId).single();
    expect(saldo.data).toMatchObject({ saldo_granel: 0, saldo_fraccionado: 5000, saldo_total: 5000 });

    // RF-23 · atribución
    const movs = await guido.from('v_movimiento').select('tipo, usuario_id, usuario_nombre').eq('insumo_id', insumoId);
    expect(movs.data).toHaveLength(3);
    for (const m of movs.data!) {
      expect(m.usuario_id).toBe(m.tipo === 'INGRESO' ? YANINA : GUIDO);
      expect(m.usuario_nombre).toBe(m.tipo === 'INGRESO' ? 'Yanina' : 'Guido');
    }

    // RF-05 · la API no permite modificar ni borrar movimientos
    const antes = await yanina.from('movimiento').select('id, cantidad_base').eq('insumo_id', insumoId).order('id');
    const cambio = await yanina.from('movimiento').update({ cantidad_base: 1 }).eq('insumo_id', insumoId).select();
    const borrado = await yanina.from('movimiento').delete().eq('insumo_id', insumoId).select();
    expect(cambio.error).not.toBeNull();
    expect(borrado.error).not.toBeNull();
    const despues = await yanina.from('movimiento').select('id, cantidad_base').eq('insumo_id', insumoId).order('id');
    expect(despues.data).toEqual(antes.data);

    // RNF-04 · otra organización no ve nada de esto
    const ajeno = await sesion('ajeno@otra.test');
    const ajenas = await ajeno.from('v_saldo_insumo').select('insumo_id').eq('insumo_id', insumoId);
    expect(ajenas.data).toEqual([]);
    const intento = await ajeno.rpc('registrar_ingreso', {
      p_insumo_id: insumoId,
      p_cantidad: 1,
      p_unidad: 'L',
      p_proveedor: 'X',
      p_costo_centavos: 100,
    });
    expect(intento.error?.message).toMatch(/no existe/);
  });
});
