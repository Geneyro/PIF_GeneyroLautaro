import { FormAltaInsumo } from '@/components/FormAltaInsumo';
import { FormFraccionamiento } from '@/components/FormFraccionamiento';
import { FormIngreso } from '@/components/FormIngreso';
import { FormPresentacion } from '@/components/FormPresentacion';
import { TablaMovimientos } from '@/components/TablaMovimientos';
import { cargarDatos } from '@/lib/datos';
import { formatCantidad } from '@/lib/format';

// Los saldos se consultan en cada request: nunca se sirven desde caché.
export const dynamic = 'force-dynamic';

export default async function Inicio() {
  let datos: Awaited<ReturnType<typeof cargarDatos>>;
  try {
    datos = await cargarDatos();
  } catch (e) {
    return (
      <main className="contenedor">
        <Encabezado />
        <section className="tarjeta mensaje mensaje-error" role="alert">
          <h2>No se pudo conectar con la base de datos</h2>
          <p>{e instanceof Error ? e.message : String(e)}</p>
          <p>
            Verifique que Supabase esté levantado (<code>npx supabase start</code>), que la migración esté aplicada (
            <code>npx supabase db reset</code>) y que <code>.env.local</code> tenga <code>SUPABASE_URL</code> y{' '}
            <code>SUPABASE_ANON_KEY</code>. Consulte el README.
          </p>
        </section>
      </main>
    );
  }

  const { insumos, presentaciones, movimientos } = datos;

  return (
    <main className="contenedor">
      <Encabezado />

      <details className="tarjeta guia">
        <summary>Caso de prueba de la Iteración 1 (paso a paso)</summary>
        <ol>
          <li>
            <b>Alta de insumo:</b> «Shampoo neutro» con unidad base <b>mL</b>.
          </li>
          <li>
            <b>Ingreso:</b> 5 <b>L</b> (bidón) → el sistema lo registra como <b>5.000 mL</b>.
          </li>
          <li>
            <b>Presentación:</b> «Botella 1 L» con contenido 1 L (= 1.000 mL).
          </li>
          <li>
            <b>Fraccionar</b> 5.000 mL en <b>4</b> botellas, merma 0 → rechazado: <i>hay 1.000 mL no explicados</i>.
          </li>
          <li>
            <b>Fraccionar</b> 5.000 mL en <b>5</b> botellas → confirmado; granel = <b>0 mL</b>, presentaciones = 5.000 mL.
          </li>
          <li>
            <b>Inmutabilidad:</b> en «Movimientos», pulse <i>Editar</i> o <i>Eliminar</i> → la base de datos lo impide.
          </li>
        </ol>
      </details>

      <section className="tarjeta">
        <h2>Saldos en unidad base <span className="etiqueta">RF-04</span></h2>
        {insumos.length === 0 ? (
          <p className="vacio">No hay insumos. Comience por el paso 1.</p>
        ) : (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th className="num">Granel</th>
                  <th className="num">En presentaciones</th>
                  <th className="num">Stock total</th>
                  <th className="num">Merma acumulada</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => (
                  <tr key={i.insumo_id}>
                    <td>{i.nombre}</td>
                    <td className="num destacado">{formatCantidad(i.saldo_granel, i.unidad_base)}</td>
                    <td className="num">{formatCantidad(i.saldo_presentaciones, i.unidad_base)}</td>
                    <td className="num">{formatCantidad(i.saldo_total, i.unidad_base)}</td>
                    <td className="num">{formatCantidad(i.merma_acumulada, i.unidad_base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {presentaciones.length > 0 && (
          <div className="tabla-scroll">
            <table>
              <thead>
                <tr>
                  <th>Presentación</th>
                  <th>Insumo</th>
                  <th className="num">Contenido</th>
                  <th className="num">Unidades</th>
                  <th className="num">Equivalente</th>
                </tr>
              </thead>
              <tbody>
                {presentaciones.map((p) => (
                  <tr key={p.presentacion_id}>
                    <td>{p.nombre}</td>
                    <td>{p.insumo_nombre}</td>
                    <td className="num">{formatCantidad(p.contenido_base, p.unidad_base)}</td>
                    <td className="num destacado">{formatCantidad(p.unidades)}</td>
                    <td className="num">{formatCantidad(p.saldo_base, p.unidad_base)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <div className="grilla">
        <section className="tarjeta">
          <h2>1 · Alta de insumo <span className="etiqueta">RF-02</span></h2>
          <FormAltaInsumo />
        </section>
        <section className="tarjeta">
          <h2>2 · Ingreso a granel <span className="etiqueta">RF-03</span></h2>
          <FormIngreso insumos={insumos} />
        </section>
        <section className="tarjeta">
          <h2>3 · Presentación de venta</h2>
          <FormPresentacion insumos={insumos} />
        </section>
      </div>

      <section className="tarjeta">
        <h2>4 · Fraccionamiento <span className="etiqueta">RF-01</span></h2>
        <p className="ayuda">
          Regla de conservación: <b>extraído del granel = unidades × contenido + merma</b>. La función PL/pgSQL rechaza
          cualquier diferencia.
        </p>
        <FormFraccionamiento insumos={insumos} presentaciones={presentaciones} />
      </section>

      <section className="tarjeta">
        <h2>Movimientos de stock <span className="etiqueta">RF-05 · inmutables</span></h2>
        <p className="ayuda">
          Últimos 50 movimientos. Los botones intentan un UPDATE/DELETE real en la base: los triggers lo bloquean.
        </p>
        <TablaMovimientos movimientos={movimientos} />
      </section>

      <footer className="pie">GFK Estética Vehicular · Prototipo v1 · Iteración 1</footer>
    </main>
  );
}

function Encabezado() {
  return (
    <header className="encabezado">
      <h1>GFK · Control de Consumo de Insumos</h1>
      <p>Prototipo v1 — motor de fraccionamiento transaccional</p>
    </header>
  );
}
