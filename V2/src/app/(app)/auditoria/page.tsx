import { FilaConteo } from '@/components/FilaConteo';
import { cargarConteos, cargarSaldos } from '@/lib/datos';
import { formatBase, formatFechaHora } from '@/lib/formato';

/** Auditoría · conteo físico presencial y ajuste del stock. */
export default async function Auditoria() {
  const [{ insumos }, conteos] = await Promise.all([cargarSaldos(), cargarConteos()]);

  return (
    <>
      <div className="titulo">
        <h1>Auditoría</h1>
        <p className="suave">Cargá el conteo físico de cada insumo a granel y ajustá el stock si hay diferencias.</p>
      </div>

      <section className="tarjeta tarjeta-tabla" aria-labelledby="titulo-conteo">
        <div className="tarjeta-cabecera">
          <h2 id="titulo-conteo">Conteo físico</h2>
        </div>
        {insumos.length === 0 ? (
          <p className="vacio">Todavía no hay insumos.</p>
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
