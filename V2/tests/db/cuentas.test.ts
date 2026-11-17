import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AJENO, Base, GUIDO, ORG_A, ORG_B, YANINA, crearBase, rechazo } from './soporte/base';

/*
 * Registro abierto con aprobación, verificado contra las migraciones reales.
 * Una cuenta nueva no ve ni opera nada hasta que un administrador la aprueba.
 */

describe('Cuentas nuevas y solicitudes de acceso', () => {
  let b: Base;

  beforeAll(async () => {
    b = await crearBase();
  });

  afterAll(async () => {
    await b.cerrar();
  });

  const solicitud = async (id: string) =>
    (await b.admin('select * from public.solicitud_acceso where usuario_id = $1', [id]))[0];

  it('una cuenta del formulario queda como solicitud con su nombre, correo y rol pedido', async () => {
    const id = await b.nuevaCuenta('formulario@pruebas.test', { nombre: '  Ana Pérez ', rol: 'ADMINISTRADOR' });
    expect(await solicitud(id)).toMatchObject({
      nombre: 'Ana Pérez',
      correo: 'formulario@pruebas.test',
      rol_solicitado: 'ADMINISTRADOR',
    });
    expect(await b.admin('select 1 from public.miembro where usuario_id = $1', [id])).toEqual([]);
  });

  it('una cuenta de Google toma el nombre del perfil y pide rol de operario', async () => {
    const id = await b.nuevaCuenta('google@pruebas.test', { full_name: 'Bruno Gómez', avatar_url: 'https://x' });
    expect(await solicitud(id)).toMatchObject({ nombre: 'Bruno Gómez', rol_solicitado: 'OPERARIO' });
    const sinNombre = await b.nuevaCuenta('solo.correo@pruebas.test');
    expect(await solicitud(sinNombre)).toMatchObject({ nombre: 'solo.correo', rol_solicitado: 'OPERARIO' });
  });

  it('un rol desconocido se toma como operario; una cuenta de alta manual no genera solicitud', async () => {
    const id = await b.nuevaCuenta('rol.raro@pruebas.test', { nombre: 'Rol raro', rol: 'SUPERUSUARIO' });
    expect((await solicitud(id)).rol_solicitado).toBe('OPERARIO');
    const manual = await b.nuevaCuenta('manual@pruebas.test', { nombre: 'Manual' }, { alta_manual: true });
    expect(await solicitud(manual)).toBeUndefined();
  });

  it('el usuario no puede marcarse a sí mismo como alta manual desde sus propios metadatos', async () => {
    const id = await b.nuevaCuenta('astuto@pruebas.test', { nombre: 'Astuto', alta_manual: true });
    expect(await solicitud(id)).toBeDefined();
  });

  it('una cuenta pendiente no ve ni opera nada', async () => {
    const id = await b.nuevaCuenta('pendiente@pruebas.test', { nombre: 'Pendiente' });
    await b.crearInsumo(YANINA, 'Cuentas visible', 'mL', [1]);

    for (const objeto of ['insumo', 'presentacion', 'movimiento', 'miembro', 'organizacion', 'v_saldo_insumo', 'solicitud_acceso']) {
      expect(await b.como(id, (q) => q(`select * from public.${objeto}`)), objeto).toEqual([]);
    }
    expect(await rechazo(b.crearInsumo(id, 'Intento', 'mL'))).toMatch(/no pertenece a ninguna organización/);
  });

  it('solo un administrador ve las solicitudes', async () => {
    const id = await b.nuevaCuenta('visible@pruebas.test', { nombre: 'Visible' });
    const deYanina = await b.como(YANINA, (q) => q('select usuario_id from public.solicitud_acceso'));
    expect(deYanina.map((f) => f.usuario_id)).toContain(id);
    expect(await b.como(GUIDO, (q) => q('select * from public.solicitud_acceso'))).toEqual([]);
    expect(await rechazo(b.como(null, (q) => q('select * from public.solicitud_acceso')))).toMatch(/permission denied/i);
  });

  it('un operario no puede aprobar ni rechazar', async () => {
    const id = await b.nuevaCuenta('espera@pruebas.test', { nombre: 'Espera' });
    expect(await rechazo(b.como(GUIDO, (q) => q('select public.aprobar_solicitud($1)', [id])))).toMatch(/Solo un administrador/);
    expect(await rechazo(b.como(GUIDO, (q) => q('select public.rechazar_solicitud($1)', [id])))).toMatch(/Solo un administrador/);
    expect(await rechazo(b.como(null, (q) => q('select public.aprobar_solicitud($1)', [id])))).toMatch(/permission denied/i);
    expect(await solicitud(id)).toBeDefined();
  });

  it('el administrador aprueba con el rol elegido: la cuenta entra a su organización y ya puede operar', async () => {
    const id = await b.nuevaCuenta('aprobada@pruebas.test', { nombre: 'Aprobada', rol: 'ADMINISTRADOR' });
    await b.como(YANINA, (q) => q('select public.aprobar_solicitud($1, $2)', [id, 'operario']));

    const [miembro] = await b.admin('select organizacion_id, nombre, rol from public.miembro where usuario_id = $1', [id]);
    expect(miembro).toEqual({ organizacion_id: ORG_A, nombre: 'Aprobada', rol: 'OPERARIO' });
    expect(await solicitud(id)).toBeUndefined();

    const insumo = await b.crearInsumo(id, 'Cuentas aprobada opera', 'mL', [1]);
    await b.ingresar(id, insumo, 5, 'L');
    expect((await b.saldo(GUIDO, insumo)).total).toBe(5000);
    // Un operario aprobado no puede aprobar a otros.
    const otra = await b.nuevaCuenta('otra@pruebas.test', { nombre: 'Otra' });
    expect(await rechazo(b.como(id, (q) => q('select public.aprobar_solicitud($1)', [otra])))).toMatch(/Solo un administrador/);
  });

  it('sin rol explícito se respeta el rol pedido; el administrador de otra organización la incorpora a la suya', async () => {
    const id = await b.nuevaCuenta('pedido@pruebas.test', { nombre: 'Pedido', rol: 'ADMINISTRADOR' });
    await b.como(AJENO, (q) => q('select public.aprobar_solicitud($1)', [id]));
    const [miembro] = await b.admin('select organizacion_id, rol from public.miembro where usuario_id = $1', [id]);
    expect(miembro).toEqual({ organizacion_id: ORG_B, rol: 'ADMINISTRADOR' });
  });

  it('el administrador puede rechazar; la cuenta sigue sin acceso', async () => {
    const id = await b.nuevaCuenta('rechazada@pruebas.test', { nombre: 'Rechazada' });
    await b.como(YANINA, (q) => q('select public.rechazar_solicitud($1)', [id]));
    expect(await solicitud(id)).toBeUndefined();
    expect(await b.admin('select 1 from public.miembro where usuario_id = $1', [id])).toEqual([]);
    expect(await rechazo(b.crearInsumo(id, 'Intento rechazada', 'mL'))).toMatch(/no pertenece a ninguna organización/);
  });

  it('rol inválido o solicitud inexistente: rechazado', async () => {
    const id = await b.nuevaCuenta('invalida@pruebas.test', { nombre: 'Inválida' });
    expect(await rechazo(b.como(YANINA, (q) => q('select public.aprobar_solicitud($1, $2)', [id, 'JEFE'])))).toMatch(/Rol no válido/);
    const inexistente = '99999999-9999-4999-8999-999999999999';
    expect(await rechazo(b.como(YANINA, (q) => q('select public.aprobar_solicitud($1)', [inexistente])))).toMatch(/no existe o ya fue resuelta/);
    expect(await rechazo(b.como(YANINA, (q) => q('select public.rechazar_solicitud($1)', [inexistente])))).toMatch(/no existe o ya fue resuelta/);
  });

  it('la puesta en marcha solo la ejecuta el servidor, y no actúa si ya hay miembros', async () => {
    const id = await b.nuevaCuenta('tarde@pruebas.test', { nombre: 'Tarde' });
    expect(await rechazo(b.como(null, (q) => q('select public.activar_primera_cuenta($1)', [id])))).toMatch(/permission denied/i);
    expect(await rechazo(b.como(YANINA, (q) => q('select public.activar_primera_cuenta($1)', [id])))).toMatch(/permission denied/i);
    const [{ activada }] = await b.comoServicio((q) => q('select public.activar_primera_cuenta($1) as activada', [id]));
    expect(activada).toBe(false);
    expect(await solicitud(id)).toBeDefined();
  });

  it('los miembros existentes conservan su rol; el rol es visible dentro de la organización', async () => {
    const filas = await b.como(GUIDO, (q) => q('select nombre, rol from public.miembro order by nombre'));
    expect(filas).toContainEqual({ nombre: 'Yanina', rol: 'ADMINISTRADOR' });
    expect(filas).toContainEqual({ nombre: 'Guido', rol: 'OPERARIO' });
    expect(filas.map((f) => f.nombre)).not.toContain('Usuario ajeno');
  });
});

describe('Puesta en marcha en una base vacía', () => {
  let b: Base;

  beforeAll(async () => {
    b = await crearBase({ vacia: true });
  });

  afterAll(async () => {
    await b.cerrar();
  });

  const activar = async (id: string) =>
    (await b.comoServicio((q) => q('select public.activar_primera_cuenta($1) as activada', [id])))[0].activada;

  it('una cuenta sin solicitud no se activa', async () => {
    const manual = await b.nuevaCuenta('manual@pruebas.test', {}, { alta_manual: true });
    expect(await activar(manual)).toBe(false);
  });

  it('la primera cuenta entra como administradora de una organización nueva, aunque haya pedido otro rol', async () => {
    const primera = await b.nuevaCuenta('primera@pruebas.test', { nombre: 'Primera', rol: 'OPERARIO' });
    expect(await activar(primera)).toBe(true);

    const [miembro] = await b.admin(
      `select m.rol, m.nombre, o.nombre as organizacion
         from public.miembro m join public.organizacion o on o.id = m.organizacion_id
        where m.usuario_id = $1`,
      [primera],
    );
    expect(miembro).toEqual({ rol: 'ADMINISTRADOR', nombre: 'Primera', organizacion: 'GFK Estética Vehicular' });
    expect(await b.admin('select 1 from public.solicitud_acceso where usuario_id = $1', [primera])).toEqual([]);

    const insumo = await b.crearInsumo(primera, 'Primer insumo', 'mL', [5]);
    expect(insumo).toBeTruthy();
  });

  it('la segunda cuenta ya no se activa sola: espera aprobación', async () => {
    const segunda = await b.nuevaCuenta('segunda@pruebas.test', { nombre: 'Segunda', rol: 'ADMINISTRADOR' });
    expect(await activar(segunda)).toBe(false);
    expect(await b.admin('select 1 from public.solicitud_acceso where usuario_id = $1', [segunda])).toHaveLength(1);
    expect(await b.admin('select count(*)::int as n from public.organizacion')).toEqual([{ n: 1 }]);
  });
});
