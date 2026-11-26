import Link from 'next/link';
import { FormCompensar } from '@/components/FormCompensar';
import { formatFechaHora } from '@/lib/formato';
import { ORIGENES, formatVariacion, type FilaRegistro, type Origen } from '@/lib/registro';

/**
 * Movimientos · libro de auditoría unificado. Todas las operaciones, de la
 * más reciente a la más antigua. Nada se edita ni se borra: una operación
 * equivocada se anula con una corrección que queda en el historial.
 */
export function PanelMovimientos({ filas, origen }: { filas: FilaRegistro[]; origen?: Origen }) {
  const visibles = origen ? filas.filter((f) => f.origen === origen) : filas;

  return (
    <>
      <div className="titulo">
        <h1>Movimientos</h1>
        <p className="suave">Historial de todas las operaciones: fraccionamientos, auditorías, servicios e ingresos.</p>
      </div>

      <nav className="filtros" aria-label="Filtrar por origen">
        <Link href="/movimientos" className="filtro" aria-current={!origen ? 'page' : undefined}>
          Todos
        </Link>
        {ORIGENES.map((o) => (
          <Link
            key={o}
            href={`/movimientos?origen=${encodeURIComponent(o)}`}
            className="filtro"
            aria-current={origen === o ? 'page' : undefined}
          >
            {o}
          </Link>
        ))}
      </nav>

      <section className="tarjeta tarjeta-tabla" aria-label="Registro de movimientos">
        {visibles.length === 0 ? (
          <p className="vacio">No hay movimientos{origen ? ` de ${origen}` : ''}.</p>
        ) : (
          <div className="tabla-contenedor">
            <table className="tabla-movimientos">
              <thead>
                <tr>
                  <th>Fecha y hora</th>
                  <th>Insumo</th>
                  <th>Origen</th>
                  <th>Tipo</th>
                  <th className="num">Variación a granel</th>
                  <th>Detalle</th>
                  <th>Usuario</th>
                </tr>
              </thead>
              <tbody>
                {visibles.map((f) => (
                  <tr key={f.clave} className={f.anulada ? 'fila-anulada' : undefined}>
                    <td className="suave sin-corte">{formatFechaHora(f.fecha)}</td>
                    <td>
                      <strong>{f.insumo}</strong>
                    </td>
                    <td>
                      <span className="etiqueta">{f.origen}</span>
                    </td>
                    <td>
                      {f.tipo}
                      {f.anulada ? <span className="etiqueta etiqueta-aviso">Anulada</span> : null}
                    </td>
                    <td className="num">
                      <span className={f.variacion < 0 ? 'cifra-negativa' : f.variacion > 0 ? 'cifra-positiva' : 'suave'}>
                        {formatVariacion(f.variacion, f.unidad)}
                      </span>
                    </td>
                    <td className="detalle">
                      {f.detalle || '—'}
                      {f.anulable ? <FormCompensar operacionId={f.operacionId} /> : null}
                    </td>
                    <td className="sin-corte">{f.usuario}</td>
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
