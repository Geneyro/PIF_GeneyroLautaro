import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AJENO, Base, GUIDO, YANINA, crearBase, rechazo } from './soporte/base';

/*
 * Criterios de aceptación de la Iteración 1, verificados contra las
 * migraciones reales. Cada bloque intenta además VIOLAR la regla
 * correspondiente por fuera de las funciones.
 */

let b: Base;

beforeAll(async () => {
  b = await crearBase();
});

afterAll(async () => {
  await b.cerrar();
});

// -----------------------------------------------------------------------------
describe('RF-23 · Autenticación y atribución', () => {
  it('sin sesión, ninguna función de negocio se puede ejecutar', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF23 sin sesión', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);

    const intentos = [
      `select public.crear_insumo('X', 'mL', '{1}')`,
      `select public.agregar_presentacion('${insumo}', 5)`,
      `select public.registrar_ingreso('${insumo}', 5, 'L', 'Proveedor', 1000)`,
      `select public.registrar_fraccionamiento('${insumo}', 1000, '${pres}', 1)`,
      `select public.compensar_operacion('${insumo}', 'motivo')`,
    ];
    for (const sql of intentos) {
      const error = await rechazo(b.como(null, (q) => q(sql)));
      expect(error, sql).toMatch(/permission denied/i);
    }
  });

  it('sin sesión, ninguna tabla ni vista se puede leer', async () => {
    const objetos = [
      'organizacion', 'miembro', 'insumo', 'presentacion', 'proveedor', 'movimiento',
      'v_saldo_insumo', 'v_saldo_presentacion', 'v_movimiento',
    ];
    for (const objeto of objetos) {
      const error = await rechazo(b.como(null, (q) => q(`select * from public.${objeto}`)));
      expect(error, objeto).toMatch(/permission denied/i);
    }
  });

  it('una sesión sin organización no puede operar', async () => {
    await b.admin(`insert into auth.users (id, email) values ('44444444-4444-4444-8444-444444444444', 'suelto@pruebas.test')`);
    const error = await rechazo(b.crearInsumo('44444444-4444-4444-8444-444444444444', 'RF23 suelto', 'mL'));
    expect(error).toMatch(/no pertenece a ninguna organización/);
  });

  it('con sesión, cada movimiento queda con el ID del usuario; los dos socios operan indistintamente', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF23 atribución', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    const opIngreso = await b.ingresar(YANINA, insumo, 5, 'L');
    const opFracc = await b.fraccionar(GUIDO, insumo, 5000, pres, 5);

    const filas = await b.admin(
      'select operacion_id, usuario_id, registrado_en from public.movimiento where insumo_id = $1',
      [insumo],
    );
    expect(filas.filter((f) => f.operacion_id === opIngreso).map((f) => f.usuario_id)).toEqual([YANINA]);
    const delFracc = filas.filter((f) => f.operacion_id === opFracc);
    expect(delFracc).toHaveLength(2);
    expect(delFracc.every((f) => f.usuario_id === GUIDO)).toBe(true);
    expect(filas.every((f) => f.registrado_en !== null)).toBe(true);
  });

  it('el autor lo fija la base: un INSERT directo no puede atribuirse a otro usuario ni hacerse sin sesión', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF23 insert directo', 'mL', [1]);
    await b.ingresar(YANINA, insumo, 1, 'L');
    const [{ proveedor_id, organizacion_id }] = await b.admin(
      'select proveedor_id, organizacion_id from public.movimiento where insumo_id = $1',
      [insumo],
    );
    const insertar = `
      insert into public.movimiento
        (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base, proveedor_id, costo_centavos, usuario_id)
      values ('${organizacion_id}', gen_random_uuid(), 'INGRESO', '${insumo}', 'GRANEL', 1000, '${proveedor_id}', 100, '${GUIDO}')
      returning usuario_id`;

    // Sin sesión (por ejemplo, SQL directo de un administrador): rechazado.
    expect(await rechazo(b.admin(insertar))).toMatch(/sesión iniciada/);

    // Rol authenticated: no tiene permiso de INSERT sobre la tabla.
    expect(await rechazo(b.como(YANINA, (q) => q(insertar)))).toMatch(/permission denied/i);

    // Con privilegios de dueño pero sesión de Yanina: queda a nombre de Yanina, no de Guido.
    await b.admin(`select set_config('request.jwt.claims', '{"sub":"${YANINA}"}', false)`);
    const [fila] = await b.admin(insertar);
    await b.admin(`select set_config('request.jwt.claims', '', false)`);
    expect(fila.usuario_id).toBe(YANINA);
  });
});

// -----------------------------------------------------------------------------
describe('RF-02 · Alta de insumo a granel y presentaciones', () => {
  it('alta con presentaciones de 1, 5 y 20 L queda con 1.000, 5.000 y 20.000 mL', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF02 Mekasil', 'mL', [1, 5, 20]);
    const filas = await b.como(YANINA, (q) =>
      q('select capacidad_base from public.presentacion where insumo_id = $1 order by capacidad_base', [insumo]),
    );
    expect(filas.map((f) => Number(f.capacidad_base))).toEqual([1000, 5000, 20000]);

    const [fila] = await b.como(YANINA, (q) => q('select unidad_base, activo, creado_por from public.insumo where id = $1', [insumo]));
    expect(fila).toMatchObject({ unidad_base: 'mL', activo: true, creado_por: YANINA });
  });

  it('alta sin unidad base: rechazada', async () => {
    expect(await rechazo(b.crearInsumo(YANINA, 'RF02 sin unidad', null, [1]))).toMatch(/unidad base es obligatoria/);
    expect(await rechazo(b.crearInsumo(YANINA, 'RF02 sin unidad', '', [1]))).toMatch(/unidad base es obligatoria/);
    expect(await rechazo(b.crearInsumo(YANINA, 'RF02 unidad rara', 'litros', [1]))).toMatch(/unidad base es obligatoria/);
  });

  it('admite las presentaciones de 60 y 120 L y rechaza cualquier otro tamaño', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF02 grandes', 'mL', [60, 120]);
    expect(await b.presentacion(insumo, 60000)).toBeTruthy();
    expect(await b.presentacion(insumo, 120000)).toBeTruthy();
    expect(await rechazo(b.crearInsumo(YANINA, 'RF02 tamaño inválido', 'mL', [1, 7]))).toMatch(/Presentación no admitida: 7/);
    // Rechazo atómico: el insumo tampoco quedó creado.
    const filas = await b.admin(`select 1 from public.insumo where nombre = 'RF02 tamaño inválido'`);
    expect(filas).toHaveLength(0);
  });

  it('un insumo en gramos guarda sus presentaciones en g; nombre vacío o repetido se rechaza', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF02 polvo', 'g', [1, 5]);
    expect(await b.presentacion(insumo, 5000)).toBeTruthy();
    expect(await rechazo(b.crearInsumo(YANINA, '   ', 'mL'))).toMatch(/nombre del insumo es obligatorio/);
    expect(await rechazo(b.crearInsumo(GUIDO, 'rf02 POLVO', 'g'))).toMatch(/Ya existe un insumo/);
  });

  it('se puede agregar una presentación después; una repetida se rechaza', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF02 agregar', 'mL', [1]);
    await b.como(GUIDO, (q) => q('select public.agregar_presentacion($1, 20)', [insumo]));
    expect(await b.presentacion(insumo, 20000)).toBeTruthy();
    expect(await rechazo(b.como(GUIDO, (q) => q('select public.agregar_presentacion($1, 20)', [insumo])))).toMatch(/ya tiene una presentación/);
  });

  it('la restricción de capacidad vale también para un INSERT directo', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF02 directo', 'mL');
    const error = await rechazo(
      b.admin(
        `insert into public.presentacion (organizacion_id, insumo_id, capacidad_base, creado_por)
         select organizacion_id, id, 2500, creado_por from public.insumo where id = $1`,
        [insumo],
      ),
    );
    expect(error).toMatch(/presentacion_capacidad_admitida/);
  });
});

// -----------------------------------------------------------------------------
describe('RF-03 · Ingreso de insumo', () => {
  it('un contenedor de 1.000 L aumenta el saldo 1.000.000 mL y queda fechado, atribuido y con costo', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF03 contenedor', 'mL', [20]);
    const op = await b.ingresar(GUIDO, insumo, 1000, 'L', 'Química Eldorado', 2_400_000_00);

    expect((await b.saldo(GUIDO, insumo)).total).toBe(1_000_000);

    const [mov] = await b.como(YANINA, (q) => q('select * from public.v_movimiento where operacion_id = $1', [op]));
    expect(mov).toMatchObject({
      tipo: 'INGRESO',
      compartimento: 'GRANEL',
      usuario_id: GUIDO,
      usuario_nombre: 'Guido',
      proveedor_nombre: 'Química Eldorado',
    });
    expect(Number(mov.cantidad_base)).toBe(1_000_000);
    expect(Number(mov.costo_centavos)).toBe(2_400_000_00);
    expect(mov.registrado_en).toBeTruthy();
  });

  it('sin proveedor o sin costo: rechazado, y el saldo no cambia', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF03 obligatorios', 'mL');
    expect(await rechazo(b.ingresar(YANINA, insumo, 5, 'L', null, 1000))).toMatch(/proveedor es obligatorio/);
    expect(await rechazo(b.ingresar(YANINA, insumo, 5, 'L', '  ', 1000))).toMatch(/proveedor es obligatorio/);
    expect(await rechazo(b.ingresar(YANINA, insumo, 5, 'L', 'Proveedor', null))).toMatch(/costo es obligatorio/);
    expect(await rechazo(b.ingresar(YANINA, insumo, 5, 'L', 'Proveedor', 0))).toMatch(/costo es obligatorio/);
    expect((await b.saldo(YANINA, insumo)).total).toBe(0);
  });

  it('convierte solo unidades compatibles y cantidades enteras positivas', async () => {
    const liquido = await b.crearInsumo(YANINA, 'RF03 líquido', 'mL');
    const solido = await b.crearInsumo(YANINA, 'RF03 sólido', 'g');
    await b.ingresar(YANINA, liquido, 750, 'mL');
    await b.ingresar(YANINA, solido, 25, 'kg');
    expect((await b.saldo(YANINA, liquido)).total).toBe(750);
    expect((await b.saldo(YANINA, solido)).total).toBe(25_000);
    expect(await rechazo(b.ingresar(YANINA, liquido, 5, 'kg'))).toMatch(/no es compatible/);
    expect(await rechazo(b.ingresar(YANINA, liquido, 0, 'L'))).toMatch(/entero mayor que 0/);
    expect(await rechazo(b.ingresar(YANINA, liquido, -5, 'L'))).toMatch(/entero mayor que 0/);
  });

  it('el mismo proveedor escrito distinto no se duplica', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF03 proveedor', 'mL');
    await b.ingresar(YANINA, insumo, 1, 'L', 'Proveedor Único SRL');
    await b.ingresar(GUIDO, insumo, 1, 'L', '  proveedor único srl ');
    const filas = await b.admin(`select 1 from public.proveedor where lower(nombre) = 'proveedor único srl'`);
    expect(filas).toHaveLength(1);
  });

  it('un INSERT directo de ingreso sin proveedor o sin costo viola la restricción de la tabla', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF03 directo', 'mL');
    await b.admin(`select set_config('request.jwt.claims', '{"sub":"${YANINA}"}', false)`);
    const error = await rechazo(
      b.admin(
        `insert into public.movimiento (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base, usuario_id)
         select organizacion_id, gen_random_uuid(), 'INGRESO', id, 'GRANEL', 1000, creado_por from public.insumo where id = $1`,
        [insumo],
      ),
    );
    await b.admin(`select set_config('request.jwt.claims', '', false)`);
    expect(error).toMatch(/movimiento_forma_valida/);
  });
});

// -----------------------------------------------------------------------------
describe('RF-01 · Fraccionamiento con conservación de cantidades', () => {
  it('bidón de 5 L en 4 botellas de 1 L sin merma: rechaza y señala 1.000 mL no explicados', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF01 bidón 4', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');

    const error = await rechazo(b.fraccionar(YANINA, insumo, 5000, pres, 4));
    expect(error).toMatch(/hay 1000 mL no explicados/);

    // Nada quedó registrado: el saldo sigue intacto.
    expect(await b.saldo(YANINA, insumo)).toMatchObject({ granel: 5000, fraccionado: 0, total: 5000 });
  });

  it('bidón de 5 L en 5 botellas de 1 L: confirma y el saldo a granel queda en 0 mL', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF01 bidón 5', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');
    const op = await b.fraccionar(GUIDO, insumo, 5000, pres, 5);

    expect(await b.saldo(GUIDO, insumo)).toMatchObject({ granel: 0, fraccionado: 5000, total: 5000, merma: 0 });

    const lineas = await b.admin(
      'select compartimento, unidades, cantidad_base from public.movimiento where operacion_id = $1 order by id',
      [op],
    );
    expect(lineas.map((l) => [l.compartimento, l.unidades, Number(l.cantidad_base)])).toEqual([
      ['GRANEL', null, -5000],
      ['PRESENTACION', 5, 5000],
    ]);
  });

  it('con saldo menor al pedido: rechaza', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF01 saldo', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 3, 'L');
    const error = await rechazo(b.fraccionar(YANINA, insumo, 5000, pres, 5));
    expect(error).toMatch(/Saldo insuficiente: se intentan tomar 5000 mL y el saldo a granel es 3000 mL/);
    expect((await b.saldo(YANINA, insumo)).granel).toBe(3000);
  });

  it('generar más de lo tomado del origen: rechaza e informa el exceso', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF01 exceso', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');
    expect(await rechazo(b.fraccionar(YANINA, insumo, 4000, pres, 5))).toMatch(/exceden en 1000 mL/);
  });

  it('rechaza presentaciones de otro insumo y cantidades no positivas', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF01 validaciones', 'mL', [1]);
    const otro = await b.crearInsumo(YANINA, 'RF01 otro insumo', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    const presAjena = await b.presentacion(otro, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');
    expect(await rechazo(b.fraccionar(YANINA, insumo, 5000, presAjena, 5))).toMatch(/no pertenece a este insumo/);
    expect(await rechazo(b.fraccionar(YANINA, insumo, 0, pres, 5))).toMatch(/mayor que 0/);
    expect(await rechazo(b.fraccionar(YANINA, insumo, 5000, pres, 0))).toMatch(/mayor que 0/);
    expect(await rechazo(b.fraccionar(YANINA, insumo, 5000, pres, 6, -1000))).toMatch(/merma no puede ser negativa/);
  });

  it('la conservación vale también para INSERT directos (trigger), no solo para la función', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF01 directo', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');
    const [{ organizacion_id: org }] = await b.admin('select organizacion_id from public.insumo where id = $1', [insumo]);
    await b.admin(`select set_config('request.jwt.claims', '{"sub":"${YANINA}"}', false)`);

    const lineas = (granel: number, unidades: number, cantidad: number) => `
      insert into public.movimiento
        (organizacion_id, operacion_id, tipo, insumo_id, compartimento, presentacion_id, unidades, cantidad_base, usuario_id)
      select '${org}', op, 'FRACCIONAMIENTO', '${insumo}', l.c::public.compartimento, l.p::uuid, l.u, l.q, '${YANINA}'
        from (select gen_random_uuid() as op) o,
             (values ('GRANEL', null, null::integer, ${granel}::bigint),
                     ('PRESENTACION', '${pres}', ${unidades}, ${cantidad}::bigint)) as l (c, p, u, q)`;

    // 5.000 mL salen del granel y solo 4.000 mL llegan a botellas.
    expect(await rechazo(b.admin(lineas(-5000, 4, 4000)))).toMatch(/Conservación de cantidades violada/);
    // Las unidades no coinciden con la capacidad de la presentación.
    expect(await rechazo(b.admin(lineas(-5000, 4, 5000)))).toMatch(/Línea de presentación inválida/);
    // Más de lo que hay en el granel.
    expect(await rechazo(b.admin(lineas(-6000, 6, 6000)))).toMatch(/Saldo insuficiente/);
    // Una sola línea suelta tampoco pasa.
    expect(
      await rechazo(
        b.admin(
          `insert into public.movimiento (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base, usuario_id)
           values ('${org}', gen_random_uuid(), 'FRACCIONAMIENTO', '${insumo}', 'GRANEL', -1000, '${YANINA}')`,
        ),
      ),
    ).toMatch(/Conservación de cantidades violada/);

    await b.admin(`select set_config('request.jwt.claims', '', false)`);
    expect(await b.saldo(YANINA, insumo)).toMatchObject({ granel: 5000, fraccionado: 0 });
  });
});

// -----------------------------------------------------------------------------
describe('RF-06 · Merma con motivo', () => {
  it('5.000 mL en 4 botellas de 1.000 mL y 1.000 mL de merma con motivo «derrame»: confirma', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF06 con motivo', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');
    const op = await b.fraccionar(GUIDO, insumo, 5000, pres, 4, 1000, 'derrame');

    expect(await b.saldo(GUIDO, insumo)).toMatchObject({ granel: 0, fraccionado: 4000, total: 4000, merma: 1000 });
    const [merma] = await b.admin(
      `select motivo, usuario_id, cantidad_base from public.movimiento where operacion_id = $1 and compartimento = 'MERMA'`,
      [op],
    );
    expect(merma).toMatchObject({ motivo: 'derrame', usuario_id: GUIDO });
    expect(Number(merma.cantidad_base)).toBe(1000);
  });

  it('el mismo caso sin motivo: rechaza', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF06 sin motivo', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');
    expect(await rechazo(b.fraccionar(YANINA, insumo, 5000, pres, 4, 1000, null))).toMatch(/debe declararse con un motivo/);
    expect(await rechazo(b.fraccionar(YANINA, insumo, 5000, pres, 4, 1000, '   '))).toMatch(/debe declararse con un motivo/);
    expect(await b.saldo(YANINA, insumo)).toMatchObject({ granel: 5000, merma: 0 });
  });
});

// -----------------------------------------------------------------------------
describe('RF-04 · Consulta de saldo', () => {
  it('con saldo de 420.000 mL muestra 420.000 mL y 21 presentaciones de 20 L', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF04 saldo', 'mL', [1, 5, 20]);
    await b.ingresar(YANINA, insumo, 420, 'L');

    expect((await b.saldo(GUIDO, insumo)).total).toBe(420_000);

    const filas = await b.como(GUIDO, (q) =>
      q('select capacidad_base, equivalente_unidades from public.v_saldo_presentacion where insumo_id = $1 order by capacidad_base', [insumo]),
    );
    expect(filas.map((f) => [Number(f.capacidad_base), Number(f.equivalente_unidades)])).toEqual([
      [1000, 420],
      [5000, 84],
      [20000, 21],
    ]);
  });

  it('el saldo mostrado es igual a la suma de los movimientos, también después de fraccionar con merma', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF04 suma', 'mL', [1, 5]);
    const pres1 = await b.presentacion(insumo, 1000);
    const pres5 = await b.presentacion(insumo, 5000);
    await b.ingresar(YANINA, insumo, 100, 'L');
    await b.ingresar(GUIDO, insumo, 2500, 'mL');
    await b.fraccionar(YANINA, insumo, 10_000, pres5, 2);
    await b.fraccionar(GUIDO, insumo, 3_500, pres1, 3, 500, 'derrame');

    const saldo = await b.saldo(YANINA, insumo);
    const [suma] = await b.admin(
      `select coalesce(sum(cantidad_base) filter (where compartimento <> 'MERMA'), 0) as existencia,
              coalesce(sum(cantidad_base), 0) as todo
         from public.movimiento where insumo_id = $1`,
      [insumo],
    );
    expect(saldo.total).toBe(Number(suma.existencia));
    expect(saldo).toEqual({ granel: 89_000, fraccionado: 13_000, total: 102_000, merma: 500 });
    // Nada se crea ni se pierde: existencia + merma = todo lo ingresado.
    expect(saldo.total + saldo.merma).toBe(102_500);
    expect(Number(suma.todo)).toBe(102_500);

    const filas = await b.como(YANINA, (q) =>
      q('select capacidad_base, unidades_en_existencia, saldo_base from public.v_saldo_presentacion where insumo_id = $1 order by capacidad_base', [insumo]),
    );
    expect(filas.map((f) => [Number(f.capacidad_base), Number(f.unidades_en_existencia), Number(f.saldo_base)])).toEqual([
      [1000, 3, 3000],
      [5000, 2, 10_000],
    ]);
  });

  it('no existe ninguna columna de saldo almacenada en las tablas', async () => {
    const filas = await b.admin(
      `select table_name, column_name from information_schema.columns
        where table_schema = 'public' and column_name like '%saldo%'
          and table_name in ('insumo', 'presentacion', 'movimiento', 'proveedor', 'organizacion', 'miembro')`,
    );
    expect(filas).toEqual([]);
  });
});

// -----------------------------------------------------------------------------
describe('RF-05 · Inmutabilidad y corrección de movimientos', () => {
  it('modificar o borrar un movimiento es rechazado para la API, para el dueño de la tabla y para service_role', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF05 inmutable', 'mL', [1]);
    await b.ingresar(YANINA, insumo, 5, 'L');
    const [{ id }] = await b.admin('select id from public.movimiento where insumo_id = $1', [insumo]);

    const sentencias = [
      `update public.movimiento set cantidad_base = 1 where id = ${id}`,
      `update public.movimiento set usuario_id = '${GUIDO}' where id = ${id}`,
      `delete from public.movimiento where id = ${id}`,
    ];
    for (const sql of sentencias) {
      // Usuario autenticado por la API: no tiene permiso.
      expect(await rechazo(b.como(YANINA, (q) => q(sql))), sql).toMatch(/permission denied/i);
      // Dueño de la tabla: lo frena el trigger.
      expect(await rechazo(b.admin(sql)), sql).toMatch(/Los movimientos son inmutables/);
    }

    // service_role (clave de servidor): también lo frena el trigger.
    await b.db.exec('grant update, delete on public.movimiento to service_role; set role service_role');
    try {
      expect(await rechazo(b.admin(sentencias[0]))).toMatch(/Los movimientos son inmutables/);
      expect(await rechazo(b.admin(sentencias[2]))).toMatch(/Los movimientos son inmutables/);
    } finally {
      await b.db.exec('reset role');
    }

    expect(await rechazo(b.admin('truncate public.movimiento'))).toMatch(/Los movimientos son inmutables/);

    const [fila] = await b.admin('select cantidad_base, usuario_id from public.movimiento where id = $1', [id]);
    expect(Number(fila.cantidad_base)).toBe(5000);
    expect(fila.usuario_id).toBe(YANINA);
  });

  it('la corrección añade un registro de compensación que referencia al original y deja el historial intacto', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF05 compensación', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    await b.ingresar(YANINA, insumo, 5, 'L');
    const opFracc = await b.fraccionar(YANINA, insumo, 5000, pres, 4, 1000, 'derrame');

    const antes = await b.admin('select * from public.movimiento where insumo_id = $1 order by id', [insumo]);

    const [{ op: opComp }] = await b.como(GUIDO, (q) =>
      q('select public.compensar_operacion($1, $2) as op', [opFracc, 'Se cargó mal: eran 5 botellas']),
    );

    // El historial previo no cambió en nada.
    const despues = await b.admin('select * from public.movimiento where insumo_id = $1 order by id', [insumo]);
    expect(despues.slice(0, antes.length)).toEqual(antes);
    expect(despues).toHaveLength(antes.length + 3);

    // Cada línea de compensación invierte y referencia a su original.
    const comp = await b.admin(
      `select c.tipo, c.cantidad_base, c.unidades, c.usuario_id, c.motivo,
              o.operacion_id as op_origen, o.cantidad_base as cantidad_origen, o.unidades as unidades_origen
         from public.movimiento c join public.movimiento o on o.id = c.movimiento_origen_id
        where c.operacion_id = $1`,
      [opComp],
    );
    expect(comp).toHaveLength(3);
    for (const c of comp) {
      expect(c.tipo).toBe('COMPENSACION');
      expect(c.op_origen).toBe(opFracc);
      expect(Number(c.cantidad_base)).toBe(-Number(c.cantidad_origen));
      expect(c.unidades === null ? null : Number(c.unidades)).toBe(c.unidades_origen === null ? null : -Number(c.unidades_origen));
      expect(c.usuario_id).toBe(GUIDO);
      expect(c.motivo).toBe('Se cargó mal: eran 5 botellas');
    }

    // El saldo vuelve al estado anterior y se puede registrar la operación correcta.
    expect(await b.saldo(YANINA, insumo)).toEqual({ granel: 5000, fraccionado: 0, total: 5000, merma: 0 });
    await b.fraccionar(YANINA, insumo, 5000, pres, 5);
    expect(await b.saldo(YANINA, insumo)).toEqual({ granel: 0, fraccionado: 5000, total: 5000, merma: 0 });
  });

  it('la compensación exige motivo, no se repite y no puede dejar saldos negativos', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RF05 límites', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    const opIngreso = await b.ingresar(YANINA, insumo, 5, 'L');
    const opFracc = await b.fraccionar(YANINA, insumo, 5000, pres, 5);
    const compensar = (op: string, motivo: string | null) =>
      b.como(YANINA, (q) => q('select public.compensar_operacion($1, $2) as op', [op, motivo]));

    expect(await rechazo(compensar(opFracc, null))).toMatch(/motivo de la corrección es obligatorio/);
    expect(await rechazo(compensar('99999999-9999-4999-8999-999999999999', 'x'))).toMatch(/no existe/);
    // Anular el ingreso dejaría el granel en −5.000 mL: ya fue fraccionado.
    expect(await rechazo(compensar(opIngreso, 'ingreso duplicado'))).toMatch(/Saldo insuficiente/);

    const [{ op: opComp }] = await compensar(opFracc, 'error de carga');
    expect(await rechazo(compensar(opFracc, 'otra vez'))).toMatch(/ya fue compensada/);
    expect(await rechazo(compensar(opComp as string, 'deshacer'))).toMatch(/no se compensa/);

    // Ahora sí se puede anular el ingreso.
    await compensar(opIngreso, 'ingreso duplicado');
    expect(await b.saldo(YANINA, insumo)).toEqual({ granel: 0, fraccionado: 0, total: 0, merma: 0 });
  });
});

// -----------------------------------------------------------------------------
describe('RNF-04 · Aislamiento entre organizaciones', () => {
  it('toda tabla de negocio tiene organizacion_id no nulo y seguridad por fila activada', async () => {
    const tablas = ['insumo', 'presentacion', 'proveedor', 'movimiento', 'miembro'];
    const columnas = await b.admin(
      `select table_name, is_nullable from information_schema.columns
        where table_schema = 'public' and column_name = 'organizacion_id' and table_name = any($1::text[])`,
      [`{${tablas.join(',')}}`],
    );
    expect(columnas).toHaveLength(tablas.length);
    expect(columnas.every((c) => c.is_nullable === 'NO')).toBe(true);

    const rls = await b.admin(
      `select relname, relrowsecurity from pg_class
        where relnamespace = 'public'::regnamespace and relkind = 'r'`,
    );
    expect(rls.length).toBeGreaterThanOrEqual(6);
    expect(rls.filter((t) => !t.relrowsecurity)).toEqual([]);
  });

  it('un usuario no ve ni opera datos de otra organización', async () => {
    const insumo = await b.crearInsumo(YANINA, 'RNF04 privado', 'mL', [1]);
    const pres = await b.presentacion(insumo, 1000);
    const op = await b.ingresar(YANINA, insumo, 5, 'L');

    for (const objeto of ['insumo', 'presentacion', 'proveedor', 'movimiento', 'v_saldo_insumo', 'v_saldo_presentacion', 'v_movimiento']) {
      const propias = await b.como(GUIDO, (q) => q(`select * from public.${objeto}`));
      const ajenas = await b.como(AJENO, (q) => q(`select * from public.${objeto}`));
      expect(propias.length, objeto).toBeGreaterThan(0);
      expect(ajenas, objeto).toEqual([]);
    }
    const miembros = await b.como(AJENO, (q) => q('select nombre from public.miembro'));
    expect(miembros.map((m) => m.nombre)).toEqual(['Usuario ajeno']);
    const orgs = await b.como(AJENO, (q) => q('select nombre from public.organizacion'));
    expect(orgs).toHaveLength(1);

    expect(await rechazo(b.ingresar(AJENO, insumo, 5, 'L'))).toMatch(/insumo indicado no existe/);
    expect(await rechazo(b.fraccionar(AJENO, insumo, 5000, pres, 5))).toMatch(/insumo indicado no existe/);
    expect(await rechazo(b.como(AJENO, (q) => q('select public.agregar_presentacion($1, 5)', [insumo])))).toMatch(/no existe/);
    expect(await rechazo(b.como(AJENO, (q) => q('select public.compensar_operacion($1, $2)', [op, 'x'])))).toMatch(/no existe/);

    // Cada organización tiene su propio espacio de nombres.
    await b.crearInsumo(AJENO, 'RNF04 privado', 'mL');
    expect((await b.saldo(YANINA, insumo)).total).toBe(5000);
  });
});
