import { FilaConteo } from '@/components/FilaConteo';
import { FormAgregarInsumo, FormEliminarInsumo, FormPuntoPedido } from '@/components/FormAjustesInsumo';
import { cargarConteos, cargarSaldos } from '@/lib/datos';
import { formatBase, formatFechaHora, formatPresentacion } from '@/lib/formato';

/** Insumos · conteo físico, ajuste del stock, alta y eliminación de insumos. */
export default async function Insumos() {
  const [{ insumos, presentaciones }, conteos] = await Promise.all([cargarSaldos(), cargarConteos()]);

  return (
    <>
      <div className="titulo">
        <h1>Insumos</h1>
        <p className="suave">Conteo físico de cada insumo a granel, ajuste del stock y alta o eliminación de insumos.</p>
      </div>

      <section className="tarjeta tarjeta-tabla" aria-labelledby="titulo-conteo">
        <div className="tarjeta-cabecera">
          <h2 id="titulo-conteo">Conteo físico</h2>
        </div>
        {insumos.length === 0 ? (
          <p className="vacio">Todavía no hay insumos. Agregalos más abajo.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla-conteo">
              <thead>
                <tr>
                  <th>Insumo a granel</th>
                  <th className="num">Saldo del sistema</th>
                  <th>Conteo físico</th>
                  <th className="num">Diferencia</th>
                  <th>Acción</th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => (
                  <FilaConteo key={i.insumo_id} insumo={i} />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="tarjeta tarjeta-tabla" aria-labelledby="titulo-administrar">
        <div className="tarjeta-cabecera">
          <h2 id="titulo-administrar">Agregar o eliminar insumos</h2>
        </div>
        <div className="tarjeta-cuerpo">
          <FormAgregarInsumo />
        </div>
        {insumos.length > 0 ? (
          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Insumo</th>
                  <th>Presentaciones</th>
                  <th>Punto de pedido</th>
                  <th>
                    <span className="oculto">Eliminar</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {insumos.map((i) => (
                  <tr key={i.insumo_id}>
                    <td>
                      <strong>{i.nombre}</strong> <span className="etiqueta">{i.unidad_base}</span>
                    </td>
                    <td className="suave">
                      {presentaciones
                        .filter((p) => p.insumo_id === i.insumo_id)
                        .map((p) => formatPresentacion(p.capacidad_base, i.unidad_base))
                        .join(' · ') || '—'}
                    </td>
                    <td>
                      <FormPuntoPedido insumoId={i.insumo_id} nombre={i.nombre} unidadBase={i.unidad_base} actual={i.punto_pedido} />
                    </td>
                    <td className="num">
                      <FormEliminarInsumo insumoId={i.insumo_id} nombre={i.nombre} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="tarjeta tarjeta-tabla" aria-labelledby="titulo-ultimos">
        <div className="tarjeta-cabecera">
          <h2 id="titulo-ultimos">Últimos conteos</h2>
        </div>
        {conteos.length === 0 ? (
          <p className="vacio">Todavía no se registraron conteos.</p>
        ) : (
          <div className="tabla-contenedor">
            <table>
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Insumo</th>
                  <th className="num">Sistema</th>
                  <th className="num">Contado</th>
                  <th className="num">Ajuste</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {conteos.map((c) => (
                  <tr key={c.id}>
                    <td className="suave">{formatFechaHora(c.registrado_en)}</td>
                    <td>{c.insumo_nombre}</td>
                    <td className="num">{formatBase(c.saldo_sistema, c.unidad_base)}</td>
                    <td className="num">{formatBase(c.conteo, c.unidad_base)}</td>
                    <td className="num">
                      {c.diferencia === 0 ? (
                        <span className="suave">Sin diferencia</span>
                      ) : (
                        <span className={c.diferencia < 0 ? 'cifra-negativa' : 'cifra-positiva'}>
                          {c.diferencia > 0 ? '+' : ''}
                          {formatBase(c.diferencia, c.unidad_base)}
                        </span>
                      )}
                    </td>
                    <td>{c.usuario_nombre ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}
