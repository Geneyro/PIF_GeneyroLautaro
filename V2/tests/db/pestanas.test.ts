import { readFileSync } from 'node:fs';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { AJENO, Base, GUIDO, ORG_A, YANINA, crearBase, rechazo } from './soporte/base';

/*
 * Dashboard, Motor de Fraccionamiento, Auditoría y Servicios, contra las
 * migraciones reales.
 */

let b: Base;

beforeAll(async () => {
  b = await crearBase();
});

afterAll(async () => {
  await b.cerrar();
});

const arr = (xs: (string | number)[]) => `{${xs.join(',')}}`;

async function nuevoInsumoConStock(nombre: string, litros = 20) {
  const id = await b.crearInsumo(YANINA, nombre, 'mL', [1, 5, 20]);
  await b.ingresar(YANINA, id, litros, 'L');
  return id;
}

function fraccionar(usuario: string, insumo: string, presentaciones: string[], unidades: number[]) {
  return b.como(usuario, (q) =>
    q('select public.fraccionar($1, $2::uuid[], $3::integer[]) as op', [insumo, arr(presentaciones), arr(unidades)]),
  );
}

function servicio(usuario: string, nombre: string, vehiculo: string, insumos: string[], cantidades: number[]) {
  return b.como(usuario, (q) =>
    q('select public.registrar_servicio($1, $2, $3::uuid[], $4::bigint[]) as op', [
      nombre,
      vehiculo,
      arr(insumos),
      arr(cantidades),
    ]),
  );
}

async function conteo(usuario: string, insumo: string, cantidad: number) {
  const [f] = await b.como(usuario, (q) => q('select public.registrar_conteo($1, $2) as diferencia', [insumo, cantidad]));
  return Number(f.diferencia);
}

// -----------------------------------------------------------------------------
describe('Motor de Fraccionamiento', () => {
  it('descuenta del granel exactamente lo que entra a las presentaciones, en una operación', async () => {
    const insumo = await nuevoInsumoConStock('Frac varias', 20);
    const p1 = await b.presentacion(insumo, 1000);
    const p5 = await b.presentacion(insumo, 5000);

    const [{ op }] = await fraccionar(GUIDO, insumo, [p1, p5, p1], [3, 2, 2]);
    expect(await b.saldo(YANINA, insumo)).toMatchObject({ granel: 5000, fraccionado: 15000, total: 20000, merma: 0 });

    const lineas = await b.admin(
      'select compartimento, presentacion_id, unidades, cantidad_base, usuario_id from public.movimiento where operacion_id = $1 order by cantidad_base',
      [op],
    );
    expect(lineas.map((l) => [l.compartimento, l.unidades, Number(l.cantidad_base)])).toEqual([
      ['GRANEL', null, -15000],
      ['PRESENTACION', 5, 5000], // 3 + 2 unidades de 1 L, agrupadas
      ['PRESENTACION', 2, 10000],
    ]);
    expect(new Set(lineas.map((l) => l.usuario_id))).toEqual(new Set([GUIDO]));
  });

  it('rechaza todo si no alcanza el stock, con un mensaje sin detalles técnicos', async () => {
    const insumo = await nuevoInsumoConStock('Frac sin stock', 5);
    const p5 = await b.presentacion(insumo, 5000);
    const error = await rechazo(fraccionar(YANINA, insumo, [p5], [2]));
    expect(error).toBe('No hay stock suficiente de Frac sin stock: hay 5.000 mL a granel y el fraccionamiento necesita 10.000 mL.');
    expect(await b.saldo(YANINA, insumo)).toMatchObject({ granel: 5000, fraccionado: 0 });
  });

  it('valida presentaciones y unidades', async () => {
    const insumo = await nuevoInsumoConStock('Frac validaciones');
    const otro = await nuevoInsumoConStock('Frac otro insumo');
    const p1 = await b.presentacion(insumo, 1000);
    const ajena = await b.presentacion(otro, 1000);

    expect(await rechazo(fraccionar(YANINA, insumo, [], []))).toMatch(/al menos una presentación/);
    expect(await rechazo(fraccionar(YANINA, insumo, [p1], [0]))).toMatch(/al menos 1 unidad/);
    expect(await rechazo(fraccionar(YANINA, insumo, [ajena], [1]))).toMatch(/no corresponde a Frac validaciones/);
    expect(await rechazo(fraccionar(AJENO, insumo, [p1], [1]))).toMatch(/Seleccione un insumo/);
  });
});

// -----------------------------------------------------------------------------
describe('Auditoría · conteo físico', () => {
  it('un faltante genera un ajuste negativo atribuido y deja el saldo en lo contado', async () => {
    const insumo = await nuevoInsumoConStock('Audit faltante', 10);
    expect(await conteo(GUIDO, insumo, 9500)).toBe(-500);
    expect((await b.saldo(YANINA, insumo)).granel).toBe(9500);

    const [mov] = await b.admin(
      "select tipo, cantidad_base, motivo, usuario_id from public.movimiento where insumo_id = $1 and tipo = 'AJUSTE'",
      [insumo],
    );
    expect(mov).toMatchObject({ tipo: 'AJUSTE', motivo: 'Conteo físico', usuario_id: GUIDO });
    expect(Number(mov.cantidad_base)).toBe(-500);

    const [c] = await b.como(YANINA, (q) => q('select * from public.v_conteo_fisico where insumo_id = $1', [insumo]));
    expect([Number(c.saldo_sistema), Number(c.conteo), Number(c.diferencia), c.usuario_nombre]).toEqual([10000, 9500, -500, 'Guido']);
  });

  it('un sobrante suma, y un conteo igual queda registrado sin movimiento', async () => {
    const insumo = await nuevoInsumoConStock('Audit sobrante', 1);
    expect(await conteo(YANINA, insumo, 1200)).toBe(200);
    expect(await conteo(YANINA, insumo, 1200)).toBe(0);
    expect((await b.saldo(YANINA, insumo)).granel).toBe(1200);
    const ajustes = await b.admin("select count(*)::int n from public.movimiento where insumo_id = $1 and tipo = 'AJUSTE'", [insumo]);
    expect(ajustes[0].n).toBe(1);
    const conteos = await b.admin('select operacion_id from public.conteo_fisico where insumo_id = $1 order by id', [insumo]);
    expect(conteos).toHaveLength(2);
    expect(conteos[1].operacion_id).toBeNull();
  });

  it('el conteo vale 0 o más, y no se edita ni se borra', async () => {
    const insumo = await nuevoInsumoConStock('Audit reglas', 1);
    expect(await rechazo(conteo(YANINA, insumo, -1))).toMatch(/igual o mayor que 0/);
    expect(await conteo(YANINA, insumo, 0)).toBe(-1000);
    expect((await b.saldo(YANINA, insumo)).granel).toBe(0);
    expect(await rechazo(b.admin('update public.conteo_fisico set conteo = 5 where insumo_id = $1', [insumo]))).toMatch(/inmutables/);
    expect(await rechazo(b.admin('delete from public.conteo_fisico where insumo_id = $1', [insumo]))).toMatch(/inmutables/);
  });
});

// -----------------------------------------------------------------------------
describe('Servicios · receta de consumo', () => {
  it('descuenta cada insumo del granel y deja el servicio en el libro de movimientos', async () => {
    const mekasil = await nuevoInsumoConStock('Serv Mekasil', 5);
    const shampoo = await nuevoInsumoConStock('Serv Shampoo', 5);

    const [{ op }] = await servicio(GUIDO, '  Lavado premium ', 'SUV', [mekasil, shampoo, mekasil], [150, 80, 50]);
    expect((await b.saldo(YANINA, mekasil)).granel).toBe(4800);
    expect((await b.saldo(YANINA, shampoo)).granel).toBe(4920);

    const movs = await b.como(YANINA, (q) =>
      q('select insumo_nombre, tipo, cantidad_base, servicio_nombre, servicio_vehiculo, usuario_nombre from public.v_movimiento where operacion_id = $1 order by insumo_nombre', [op]),
    );
    expect(movs.map((m) => [m.insumo_nombre, m.tipo, Number(m.cantidad_base), m.servicio_nombre, m.servicio_vehiculo, m.usuario_nombre])).toEqual([
      ['Serv Mekasil', 'CONSUMO', -200, 'Lavado premium', 'SUV', 'Guido'],
      ['Serv Shampoo', 'CONSUMO', -80, 'Lavado premium', 'SUV', 'Guido'],
    ]);
  });

  it('si un insumo no alcanza, no descuenta ninguno', async () => {
    const a = await nuevoInsumoConStock('Serv alcanza', 5);
    const c = await nuevoInsumoConStock('Serv no alcanza', 1);
    const error = await rechazo(servicio(YANINA, 'Pulido', 'Sedán', [a, c], [100, 1500]));
    expect(error).toBe('No hay stock suficiente de Serv no alcanza: hay 1.000 mL a granel y el servicio usa 1.500 mL.');
    expect((await b.saldo(YANINA, a)).granel).toBe(5000);
    const servicios = await b.admin("select count(*)::int n from public.servicio where nombre = 'Pulido'");
    expect(servicios[0].n).toBe(0);
  });

  it('exige nombre, vehículo y cantidades enteras positivas', async () => {
    const a = await nuevoInsumoConStock('Serv validaciones', 1);
    expect(await rechazo(servicio(YANINA, ' ', 'SUV', [a], [10]))).toMatch(/nombre del servicio/);
    expect(await rechazo(servicio(YANINA, 'Lavado', '', [a], [10]))).toMatch(/tipo de vehículo/);
    expect(await rechazo(servicio(YANINA, 'Lavado', 'SUV', [], []))).toMatch(/al menos un insumo/);
    expect(await rechazo(servicio(YANINA, 'Lavado', 'SUV', [a], [0]))).toMatch(/mayor que 0/);
    expect(await rechazo(servicio(AJENO, 'Lavado', 'SUV', [a], [10]))).toMatch(/no existe o está dado de baja/);
  });

  it('el servicio no se edita ni se borra, y otra organización no lo ve', async () => {
    const a = await nuevoInsumoConStock('Serv inmutable', 1);
    await servicio(YANINA, 'Encerado', 'Moto', [a], [10]);
    expect(await rechazo(b.admin("update public.servicio set nombre = 'Otro' where nombre = 'Encerado'"))).toMatch(/inmutables/);
    expect(await rechazo(b.admin("delete from public.servicio where nombre = 'Encerado'"))).toMatch(/inmutables/);
    const ajeno = await b.como(AJENO, (q) => q("select * from public.servicio where nombre = 'Encerado'"));
    expect(ajeno).toEqual([]);
  });

  it('un consumo sin servicio por fuera de las funciones respeta las reglas del libro', async () => {
    const a = await nuevoInsumoConStock('Serv directo', 1);
    const intento = b.como(YANINA, (q) =>
      q(
        `insert into public.movimiento (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base, usuario_id)
         values ($1, gen_random_uuid(), 'CONSUMO', $2, 'GRANEL', 50, $3)`,
        [ORG_A, a, YANINA],
      ),
    );
    expect(await rechazo(intento)).toMatch(/permission denied/i);
    const forma = b.admin(
      `insert into public.movimiento (organizacion_id, operacion_id, tipo, insumo_id, compartimento, cantidad_base, usuario_id)
       values ($1, gen_random_uuid(), 'CONSUMO', $2, 'GRANEL', 50, $3)`,
      [ORG_A, a, YANINA],
    );
    expect(await rechazo(forma)).toMatch(/movimiento_forma_valida|sesión/);
  });
});

// -----------------------------------------------------------------------------
describe('Dashboard · reposición', () => {
  const reponer = async (insumo: string) =>
    (await b.como(YANINA, (q) => q('select reponer from public.v_saldo_insumo where insumo_id = $1', [insumo])))[0].reponer;

  it('marca para reponer todo insumo con menos de 100 L a granel', async () => {
    const insumo = await nuevoInsumoConStock('Dash 100 L', 101);
    expect(await reponer(insumo)).toBe(false);
    await servicio(GUIDO, 'Lavado', 'SUV', [insumo], [1000]);
    expect(await reponer(insumo)).toBe(false); // 100 L justos: todavía no
    await servicio(GUIDO, 'Lavado', 'SUV', [insumo], [1]);
    expect(await reponer(insumo)).toBe(true);

    const vacio = await b.crearInsumo(YANINA, 'Dash sin stock', 'mL', [1]);
    expect(await reponer(vacio)).toBe(true);
  });

  it('un punto de pedido mayor que 100 L adelanta la alerta', async () => {
    const insumo = await nuevoInsumoConStock('Dash reposición', 150);
    expect(await reponer(insumo)).toBe(false);
    await b.como(GUIDO, (q) => q('select public.definir_punto_pedido($1, $2)', [insumo, 140000]));
    expect(await reponer(insumo)).toBe(false);
    await servicio(GUIDO, 'Lavado', 'SUV', [insumo], [10000]);
    expect(await reponer(insumo)).toBe(true);
    await b.como(YANINA, (q) => q('select public.definir_punto_pedido($1, null)', [insumo]));
    expect(await reponer(insumo)).toBe(false);
    expect(await rechazo(b.como(YANINA, (q) => q('select public.definir_punto_pedido($1, 0)', [insumo])))).toMatch(/mayor que 0/);
  });

  it('un insumo dado de baja no se puede usar', async () => {
    const insumo = await nuevoInsumoConStock('Dash baja', 1);
    await b.como(YANINA, (q) => q('select public.cambiar_estado_insumo($1, false)', [insumo]));
    expect(await rechazo(servicio(YANINA, 'Lavado', 'SUV', [insumo], [10]))).toMatch(/dado de baja/);
    expect(await rechazo(conteo(YANINA, insumo, 10))).toMatch(/dado de baja/);
    await b.como(YANINA, (q) => q('select public.cambiar_estado_insumo($1, true)', [insumo]));
    await servicio(YANINA, 'Lavado', 'SUV', [insumo], [10]);
  });

  it('sin sesión no se ejecuta ninguna operación nueva ni se leen sus tablas', async () => {
    const sqls = [
      `select public.fraccionar(gen_random_uuid(), '{}'::uuid[], '{}'::integer[])`,
      `select public.registrar_conteo(gen_random_uuid(), 1)`,
      `select public.registrar_servicio('a', 'b', '{}'::uuid[], '{}'::bigint[])`,
      `select public.definir_punto_pedido(gen_random_uuid(), 1)`,
      `select public.cambiar_estado_insumo(gen_random_uuid(), true)`,
      'select * from public.servicio',
      'select * from public.conteo_fisico',
      'select * from public.v_conteo_fisico',
    ];
    for (const sql of sqls) {
      expect(await rechazo(b.como(null, (q) => q(sql))), sql).toMatch(/permission denied/i);
    }
  });
});

// -----------------------------------------------------------------------------
describe('Catálogo inicial de GFK', () => {
  it('agrega los insumos del taller que falten, sin tocar los existentes', async () => {
    const base = await crearBase({ vacia: true });
    try {
      const usuario = await base.nuevaCuenta('admin@pruebas.test', {}, { alta_manual: true });
      await base.admin(`insert into public.organizacion (id, nombre) values ('${ORG_A}', 'GFK')`);
      await base.admin(`insert into public.miembro (usuario_id, organizacion_id, nombre, rol) values ($1, '${ORG_A}', 'Admin', 'ADMINISTRADOR')`, [usuario]);
      await base.crearInsumo(usuario, 'citrolimp', 'mL', [5]);

      const migracion = readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261125000002_pestanas.sql'), 'utf8');
      const bloque = migracion.slice(migracion.lastIndexOf('do $$'));
      await base.admin(bloque);
      await base.admin(bloque); // repetirlo no duplica nada

      const insumos = await base.admin(
        'select i.nombre, array_agg(p.capacidad_base order by p.capacidad_base) as caps from public.insumo i left join public.presentacion p on p.insumo_id = i.id group by i.nombre order by lower(i.nombre)',
      );
      expect(insumos.map((i) => [i.nombre, (i.caps as number[]).map(Number)])).toEqual([
        ['BB Tradicional', [1000, 5000, 20000]],
        ['BB Ultra', [1000, 5000, 20000]],
        ['citrolimp', [5000]],
        ['Mekasil Tradicional', [1000, 5000, 20000]],
        ['Mekasil Ultra', [1000, 5000, 20000]],
        ['Shampoo Siliconado', [1000, 5000, 20000]],
      ]);
    } finally {
      await base.cerrar();
    }
  });
});

// -----------------------------------------------------------------------------
describe('Insumos · agregar y eliminar', () => {
  const agregar = (usuario: string, nombre: string, unidad = 'mL') =>
    b.como(usuario, (q) => q('select public.agregar_insumo($1, $2) as id', [nombre, unidad])).then((f) => f[0].id as string);
  const capacidades = async (insumo: string) =>
    (await b.admin('select capacidad_base from public.presentacion where insumo_id = $1 and activo order by 1', [insumo])).map((f) =>
      Number(f.capacidad_base),
    );

  it('un insumo nuevo tiene las cinco presentaciones, de 1 a 120 L', async () => {
    const id = await agregar(YANINA, '  Insumo nuevo ');
    expect(await capacidades(id)).toEqual([1000, 5000, 20000, 60000, 120000]);
    const [i] = await b.admin('select nombre, unidad_base, creado_por from public.insumo where id = $1', [id]);
    expect(i).toEqual({ nombre: 'Insumo nuevo', unidad_base: 'mL', creado_por: YANINA });
  });

  it('los insumos existentes recibieron las presentaciones que les faltaban', async () => {
    const id = await b.crearInsumo(YANINA, 'Insumo viejo', 'mL', [5]);
    const migracion = readFileSync(path.join(__dirname, '..', '..', 'supabase', 'migrations', '20261126000001_insumos.sql'), 'utf8');
    const relleno = migracion.match(/select interno\.completar_presentaciones\(i\.id\) from public\.insumo i;/)?.[0];
    expect(relleno).toBeTruthy();
    await b.admin(relleno as string);
    expect(await capacidades(id)).toEqual([1000, 5000, 20000, 60000, 120000]);
  });

  it('eliminar es una baja lógica; volver a agregarlo lo reactiva con su saldo e historial', async () => {
    const id = await agregar(YANINA, 'Insumo a eliminar');
    await b.ingresar(YANINA, id, 5, 'L');
    await b.como(YANINA, (q) => q('select public.cambiar_estado_insumo($1, false)', [id]));
    const visibles = await b.como(GUIDO, (q) => q('select 1 from public.v_saldo_insumo where insumo_id = $1 and activo', [id]));
    expect(visibles).toHaveLength(0);

    expect(await agregar(YANINA, 'INSUMO A ELIMINAR')).toBe(id);
    expect((await b.saldo(YANINA, id)).granel).toBe(5000);
  });

  it('rechaza nombres vacíos, repetidos, unidades inválidas y usuarios sin sesión', async () => {
    await agregar(YANINA, 'Insumo repetido');
    expect(await rechazo(agregar(YANINA, 'insumo REPETIDO'))).toMatch(/Ya existe un insumo llamado "insumo REPETIDO"/);
    expect(await rechazo(agregar(YANINA, '   '))).toMatch(/nombre del insumo/);
    expect(await rechazo(agregar(YANINA, 'x'.repeat(81)))).toMatch(/hasta 80/);
    expect(await rechazo(agregar(YANINA, 'Unidad rara', 'L'))).toMatch(/mL o g/);
    expect(await rechazo(b.como(null, (q) => q("select public.agregar_insumo('X')")))).toMatch(/permission denied/i);
  });

  it('un operario no puede agregar ni eliminar insumos, pero sí definir el punto de pedido', async () => {
    const id = await agregar(YANINA, 'Insumo del administrador');
    expect(await rechazo(agregar(GUIDO, 'Insumo del operario'))).toMatch(/Solo un administrador puede agregar o eliminar insumos/);
    expect(await rechazo(b.como(GUIDO, (q) => q('select public.cambiar_estado_insumo($1, false)', [id])))).toMatch(
      /Solo un administrador/,
    );
    expect(await b.admin("select 1 from public.insumo where nombre = 'Insumo del operario'")).toHaveLength(0);
    expect((await b.admin('select activo from public.insumo where id = $1', [id]))[0].activo).toBe(true);

    await b.como(GUIDO, (q) => q('select public.definir_punto_pedido($1, $2)', [id, 1000]));
  });
});
