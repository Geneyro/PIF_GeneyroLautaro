import Link from 'next/link';
import { AlertTriangle, CheckCircle2, ClipboardCheck, Droplets, Layers } from 'lucide-react';
import { baseAMayor, formatBase, unidadMayor } from '@/lib/formato';
import type { SaldoInsumo } from '@/lib/tipos';

/** Porcentaje (solo para dibujar): cantidad respecto de la escala. */
function ancho(cantidad: number, escala: number): string {
  if (escala <= 0 || cantidad <= 0) return '0%';
  return `${Math.max(1, Math.round((cantidad * 1000) / escala) / 10)}%`;
}

/**
 * Mínimo a granel: 100 L (100.000 mL). La vista `v_saldo_insumo` aplica la
 * misma regla en la columna `reponer`; acá solo se usa para mostrarla.
 */
const MINIMO_GRANEL = 100_000;

/** Cantidad por debajo de la cual se pide reponer: 100 L o el punto de pedido, si es mayor. */
function minimo(i: SaldoInsumo): number {
  return Math.max(MINIMO_GRANEL, i.punto_pedido ?? 0);
}

/** «A, B y C». */
function enumerar(nombres: string[]): string {
  return nombres.length <= 1 ? (nombres[0] ?? '') : `${nombres.slice(0, -1).join(', ')} y ${nombres[nombres.length - 1]}`;
}

function Estado({ i }: { i: SaldoInsumo }) {
  return i.reponer ? (
    <span className="estado estado-aviso">
      <AlertTriangle size={14} aria-hidden="true" /> Reponer
    </span>
  ) : (
    <span className="estado estado-ok">
      <CheckCircle2 size={14} aria-hidden="true" /> Normal
    </span>
  );
}

/** Dashboard General · saldos a granel y alertas de reposición. */
export function PanelDashboard({ insumos }: { insumos: SaldoInsumo[] }) {
  const alertas = insumos.filter((i) => i.reponer);
  const enMl = insumos.filter((i) => i.unidad_base === 'mL');
  const totalMl = enMl.reduce((s, i) => s + i.saldo_granel, 0);
  const escala = Math.max(1, ...insumos.map((i) => Math.max(i.saldo_granel, minimo(i))));

  return (
    <>
      <div className="titulo">
        <h1>Dashboard General</h1>
        <p className="suave">Saldos a granel y alertas de reposición, actualizados con cada operación.</p>
      </div>

      <div className="metricas">
        <div className="metrica">
          <span className="metrica-icono">
            <Droplets size={20} aria-hidden="true" />
          </span>
          <span className="metrica-titulo">Stock a granel</span>
          <strong className="metrica-valor">{baseAMayor(totalMl)} L</strong>
          <span className="suave">{formatBase(totalMl, 'mL')} en depósito</span>
        </div>
        <div className={alertas.length ? 'metrica metrica-aviso' : 'metrica'}>
          <span className="metrica-icono">
            {alertas.length ? <AlertTriangle size={20} aria-hidden="true" /> : <CheckCircle2 size={20} aria-hidden="true" />}
          </span>
          <span className="metrica-titulo">Alertas de reposición</span>
          <strong className="metrica-valor">{alertas.length}</strong>
          <span className="suave">
            {alertas.length === 0
              ? 'Ningún insumo para reponer'
              : `${alertas.length === 1 ? 'Insumo' : 'Insumos'} para reponer: ${enumerar(alertas.map((i) => i.nombre))}`}
          </span>
        </div>
        <div className="metrica">
          <span className="metrica-icono">
            <Layers size={20} aria-hidden="true" />
          </span>
          <span className="metrica-titulo">Insumos activos</span>
          <strong className="metrica-valor">{insumos.length}</strong>
          <span className="suave">Insumos a granel registrados</span>
        </div>
      </div>

      {alertas.length > 0 ? (
        <section aria-labelledby="titulo-alertas">
          <h2 id="titulo-alertas">
            Reposición · {alertas.length} {alertas.length === 1 ? 'insumo' : 'insumos'}
          </h2>
          <div className="alertas">
            {alertas.map((i) => (
              <article key={i.insumo_id} className="alerta">
                <AlertTriangle size={20} aria-hidden="true" className="alerta-icono" />
                <div>
                  <strong>Reponer {i.nombre}</strong>
                  <p>
                    Quedan {baseAMayor(i.saldo_granel)} {unidadMayor(i.unidad_base)} a granel · mínimo{' '}
                    {baseAMayor(minimo(i))} {unidadMayor(i.unidad_base)}
                  </p>
                </div>
                <Link href="/insumos" className="boton boton-chico">
                  <ClipboardCheck size={16} aria-hidden="true" /> Ir a Insumos
                </Link>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {insumos.length === 0 ? (
        <section className="tarjeta">
          <p className="vacio">
            Todavía no hay insumos. Agregalos en <Link href="/insumos">Insumos</Link>.
          </p>
        </section>
      ) : (
        <>
          <section className="tarjeta" aria-labelledby="titulo-resumen">
            <div className="tarjeta-cabecera">
              <h2 id="titulo-resumen">Saldo a granel por insumo</h2>
              <span className="suave leyenda">
                <span className="leyenda-marca" aria-hidden="true" /> Mínimo de reposición
              </span>
            </div>
            <ul className="barras">
              {insumos.map((i) => {
                const u = unidadMayor(i.unidad_base);
                const resumen = `${i.nombre}: ${formatBase(i.saldo_granel, i.unidad_base)} · mínimo ${formatBase(minimo(i), i.unidad_base)}`;
                return (
                  <li key={i.insumo_id} className={i.reponer ? 'barra-fila barra-reponer' : 'barra-fila'} title={resumen}>
                    <span className="barra-nombre">
                      {i.reponer ? <AlertTriangle size={14} aria-label="Reponer" /> : null}
                      {i.nombre}
                    </span>
                    <span className="barra-pista" aria-hidden="true">
                      <span className="barra-valor" style={{ width: ancho(i.saldo_granel, escala) }} />
                      <span className="barra-punto" style={{ left: ancho(minimo(i), escala) }} />
                    </span>
                    <span className="barra-cifra num">
                      {baseAMayor(i.saldo_granel)} {u}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section className="tarjeta tarjeta-tabla" aria-labelledby="titulo-saldos">
            <div className="tarjeta-cabecera">
              <h2 id="titulo-saldos">Saldos de insumos a granel</h2>
            </div>
            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th className="num">A granel</th>
                    <th className="num">Equivalente</th>
                    <th className="num">Fraccionado</th>
                    <th className="num">Mínimo</th>
                    <th>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {insumos.map((i) => (
                    <tr key={i.insumo_id}>
                      <td>
                        <strong>{i.nombre}</strong>
                      </td>
                      <td className="num cifra-destacada">{formatBase(i.saldo_granel, i.unidad_base)}</td>
                      <td className="num">
                        {baseAMayor(i.saldo_granel)} {unidadMayor(i.unidad_base)}
                      </td>
                      <td className="num">{formatBase(i.saldo_fraccionado, i.unidad_base)}</td>
                      <td className="num">{formatBase(minimo(i), i.unidad_base)}</td>
                      <td>
                        <Estado i={i} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  );
}
