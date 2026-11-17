import Link from 'next/link';
import { cargarSaldos } from '@/lib/datos';
import { formatBase, formatEntero, formatPresentacion, baseAMayor, unidadMayor } from '@/lib/formato';

/** RF-04 · Saldo de cada insumo en unidad base y su equivalente por presentación. */
export default async function Saldos() {
  const { insumos, presentaciones } = await cargarSaldos();

  return (
    <>
      <h1>Saldos</h1>
      <p className="suave">Cada saldo es la suma de los movimientos registrados. No se edita: se corrige con movimientos.</p>

      {insumos.length === 0 ? (
        <p className="vacio">
          Todavía no hay insumos. Empezá por el <Link href="/catalogo">Catálogo</Link>.
        </p>
      ) : (
        <div className="grilla">
          {insumos.map((i) => {
            const pres = presentaciones.filter((p) => p.insumo_id === i.insumo_id);
            return (
              <section key={i.insumo_id} className="tarjeta">
                <h2>{i.nombre}</h2>
                <p className="saldo">
                  {formatBase(i.saldo_total, i.unidad_base)}
                  <span className="suave">
                    {' '}
                    = {baseAMayor(i.saldo_total)} {unidadMayor(i.unidad_base)}
                  </span>
                </p>
                <dl className="desglose">
                  <div>
                    <dt>A granel</dt>
                    <dd>{formatBase(i.saldo_granel, i.unidad_base)}</dd>
                  </div>
                  <div>
                    <dt>Fraccionado</dt>
                    <dd>{formatBase(i.saldo_fraccionado, i.unidad_base)}</dd>
                  </div>
                  <div>
                    <dt>Merma acumulada</dt>
                    <dd>{formatBase(i.merma_acumulada, i.unidad_base)}</dd>
                  </div>
                </dl>

                {pres.length > 0 ? (
                  <div className="tabla-contenedor">
                    <table>
                      <thead>
                        <tr>
                          <th>Presentación</th>
                          <th className="num">Equivale a</th>
                          <th className="num">Ya fraccionadas</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pres.map((p) => (
                          <tr key={p.presentacion_id}>
                            <td>{formatPresentacion(p.capacidad_base, i.unidad_base)}</td>
                            <td className="num">{formatEntero(p.equivalente_unidades)} u.</td>
                            <td className="num">{formatEntero(p.unidades_en_existencia)} u.</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="suave">Sin presentaciones.</p>
                )}
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
