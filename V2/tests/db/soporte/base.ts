import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';

/*
 * Base de datos PostgreSQL en memoria (PGlite) con las migraciones reales del
 * proyecto aplicadas. Permite probar las reglas de negocio de la base sin
 * Docker ni conexión a la nube.
 */

const RAIZ = path.resolve(__dirname, '..', '..', '..');
const MIGRACIONES = path.join(RAIZ, 'supabase', 'migrations');

export const ORG_A = '0a000000-0000-4000-8000-000000000001';
export const ORG_B = '0b000000-0000-4000-8000-000000000002';
export const YANINA = '11111111-1111-4111-8111-111111111111';
export const GUIDO = '22222222-2222-4222-8222-222222222222';
/** Usuario de otra organización, para las pruebas de aislamiento (RNF-04). */
export const AJENO = '33333333-3333-4333-8333-333333333333';

export type Fila = Record<string, unknown>;
export type Consulta = (sql: string, params?: unknown[]) => Promise<Fila[]>;

export class Base {
  constructor(readonly db: PGlite) {}

  /** Ejecuta como administrador (dueño de la base), sin sesión de usuario. */
  admin: Consulta = async (sql, params = []) => {
    const r = await this.db.query<Fila>(sql, params);
    return r.rows;
  };

  /**
   * Ejecuta `fn` con el rol y la sesión que tendría una petición de la API:
   * `authenticated` con el usuario indicado, o `anon` si usuario es null.
   */
  async como<T>(usuario: string | null, fn: (q: Consulta) => Promise<T>): Promise<T> {
    const claims = usuario ? JSON.stringify({ sub: usuario, role: 'authenticated' }) : '';
    await this.db.query(`select set_config('request.jwt.claims', $1, false)`, [claims]);
    await this.db.exec(`set role ${usuario ? 'authenticated' : 'anon'}`);
    try {
      return await fn(this.admin);
    } finally {
      await this.db.exec('reset role');
      await this.db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  }

  /** Ejecuta `fn` como el servidor de la aplicación (clave de servicio, sin usuario). */
  async comoServicio<T>(fn: (q: Consulta) => Promise<T>): Promise<T> {
    await this.db.query(`select set_config('request.jwt.claims', '', false)`);
    await this.db.exec('set role service_role');
    try {
      return await fn(this.admin);
    } finally {
      await this.db.exec('reset role');
    }
  }

  /** Crea una cuenta de Supabase Auth, como lo harían el formulario o Google. */
  async nuevaCuenta(correo: string, metadatos: Record<string, unknown> = {}, metadatosApp: Record<string, unknown> = {}) {
    const [fila] = await this.admin(
      'insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, $2::jsonb, $3::jsonb) returning id',
      [correo, JSON.stringify(metadatos), JSON.stringify(metadatosApp)],
    );
    return fila.id as string;
  }

  // --- Atajos de las operaciones del sistema -------------------------------

  async crearInsumo(usuario: string, nombre: string, unidadBase: string | null, presentaciones: number[] = []) {
    const filas = await this.como(usuario, (q) =>
      q('select public.crear_insumo($1, $2, $3::integer[]) as id', [nombre, unidadBase, `{${presentaciones.join(',')}}`]),
    );
    return filas[0].id as string;
  }

  async presentacion(insumoId: string, capacidadBase: number) {
    const filas = await this.admin(
      'select id from public.presentacion where insumo_id = $1 and capacidad_base = $2',
      [insumoId, capacidadBase],
    );
    return filas[0].id as string;
  }

  async ingresar(
    usuario: string,
    insumoId: string,
    cantidad: number,
    unidad: string,
    proveedor: string | null = 'Química Eldorado',
    costoCentavos: number | null = 100_000_00,
  ) {
    const filas = await this.como(usuario, (q) =>
      q('select public.registrar_ingreso($1, $2, $3, $4, $5) as op', [insumoId, cantidad, unidad, proveedor, costoCentavos]),
    );
    return filas[0].op as string;
  }

  async fraccionar(
    usuario: string,
    insumoId: string,
    cantidadOrigen: number,
    presentacionId: string,
    unidades: number,
    merma = 0,
    motivoMerma: string | null = null,
  ) {
    const filas = await this.como(usuario, (q) =>
      q('select public.registrar_fraccionamiento($1, $2, $3, $4, $5, $6) as op', [
        insumoId,
        cantidadOrigen,
        presentacionId,
        unidades,
        merma,
        motivoMerma,
      ]),
    );
    return filas[0].op as string;
  }

  async saldo(usuario: string, insumoId: string) {
    const filas = await this.como(usuario, (q) =>
      q('select * from public.v_saldo_insumo where insumo_id = $1', [insumoId]),
    );
    const f = filas[0];
    return {
      granel: Number(f.saldo_granel),
      fraccionado: Number(f.saldo_fraccionado),
      total: Number(f.saldo_total),
      merma: Number(f.merma_acumulada),
    };
  }

  async cerrar() {
    await this.db.close();
  }
}

/**
 * Crea la base y aplica las migraciones. Salvo que se pida una base vacía,
 * carga dos organizaciones: en la A, Yanina (administradora) y Guido
 * (operario); en la B, un administrador ajeno.
 */
export async function crearBase({ vacia = false }: { vacia?: boolean } = {}): Promise<Base> {
  const db = new PGlite();
  await db.exec(readFileSync(path.join(__dirname, 'supabase-simulado.sql'), 'utf8'));

  for (const archivo of readdirSync(MIGRACIONES).filter((f) => f.endsWith('.sql')).sort()) {
    try {
      await db.exec(readFileSync(path.join(MIGRACIONES, archivo), 'utf8'));
    } catch (e) {
      throw new Error(`Falló la migración ${archivo}: ${(e as Error).message}`);
    }
  }

  if (vacia) return new Base(db);

  // Cuentas de alta manual: no generan solicitud, se asocian acá mismo.
  await db.exec(`
    insert into auth.users (id, email, raw_app_meta_data) values
      ('${YANINA}', 'yanina@pruebas.test', '{"alta_manual": true}'),
      ('${GUIDO}', 'guido@pruebas.test', '{"alta_manual": true}'),
      ('${AJENO}', 'ajeno@pruebas.test', '{"alta_manual": true}');
    insert into public.organizacion (id, nombre) values
      ('${ORG_A}', 'GFK Estética Vehicular (pruebas)'),
      ('${ORG_B}', 'Otra organización (pruebas)');
    insert into public.miembro (usuario_id, organizacion_id, nombre, rol) values
      ('${YANINA}', '${ORG_A}', 'Yanina', 'ADMINISTRADOR'),
      ('${GUIDO}', '${ORG_A}', 'Guido', 'OPERARIO'),
      ('${AJENO}', '${ORG_B}', 'Usuario ajeno', 'ADMINISTRADOR');
  `);

  return new Base(db);
}

/** Devuelve el mensaje de error de una operación que debe ser rechazada. */
export async function rechazo(operacion: Promise<unknown>): Promise<string> {
  try {
    await operacion;
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error('La operación debía ser rechazada por la base de datos, pero fue aceptada.');
}
