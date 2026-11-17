import { FormCompensar } from '@/components/FormCompensar';
import { cargarMovimientos } from '@/lib/datos';
import { formatBase, formatFechaHora, formatPesos, formatPresentacion } from '@/lib/formato';
import type { Compartimento, Movimiento, TipoMovimiento } from '@/lib/tipos';

const TIPOS: Record<TipoMovimiento, string> = {
  INGRESO: 'Ingreso',
  FRACCIONAMIENTO: 'Fraccionamiento',
  COMPENSACION: 'Compensación',
};

const COMPARTIMENTOS: Record<Compartimento, string> = {
  GRANEL: 'A granel',
  PRESENTACION: 'Presentación',
  MERMA: 'Merma',
};

function conSigno(m: Movimiento): string {
  return (m.cantidad_base > 0 ? '+' : '') + formatBase(m.cantidad_base, m.unidad_base);
}

/** RF-05 · Historial de movimientos: se consulta y se compensa, nunca se edita. */
export default async function Movimientos() {
  const movimientos = await cargarMovimientos();

  // Agrupa las líneas por operación, conservando el orden (más reciente primero).
  const operaciones = new Map<string, Movimiento[]>();
  for (const m of movimientos) {
    const lineas = operaciones.get(m.operacion_id) ?? [];
    lineas.push(m);
    operaciones.set(m.operacion_id, lineas);
  }

  return (
    <>
      <h1>Movimientos</h1>
      <p className="suave">
        Los movimientos son inmutables. Un error se corrige con una compensación, que queda en el historial junto al
        original.
      </p>

      {operaciones.size === 0 ? (
        <p className="vacio">Todavía no hay movimientos.</p>
      ) : (
        <ul className="operaciones">
          {[...operaciones.entries()].map(([operacionId, lineasDesc]) => {
            const lineas = [...lineasDesc].reverse();
            const primera = lineas[0];
            const compensada = lineas.some((l) => l.compensado);
            const esCompensacion = primera.tipo === 'COMPENSACION';
            const motivo = lineas.find((l) => l.motivo)?.motivo;
            return (
              <li key={operacionId} className="tarjeta operacion">
                <div className="operacion-cabecera">
                  <strong>
                    {TIPOS[primera.tipo]} · {primera.insumo_nombre}
                  </strong>
                  {compensada ? <span className="etiqueta etiqueta-aviso">Compensada</span> : null}
                </div>
                <p className="suave">
                  {formatFechaHora(primera.registrado_en)} · por {primera.usuario_nombre ?? 'usuario desconocido'}
                  {primera.proveedor_nombre ? ` · ${primera.proveedor_nombre}` : ''}
                  {primera.costo_centavos !== null ? ` · ${formatPesos(primera.costo_centavos)}` : ''}
                </p>
                <ul className="lineas">
                  {lineas.map((l) => (
                    <li key={l.id}>
                      <span>
                        {COMPARTIMENTOS[l.compartimento]}
                        {l.capacidad_base !== null && l.unidades !== null
                          ? ` · ${l.unidades > 0 ? '+' : ''}${l.unidades} × ${formatPresentacion(l.capacidad_base, l.unidad_base)}`
                          : ''}
                      </span>
                      <span className="num">{conSigno(l)}</span>
                    </li>
                  ))}
                </ul>
                {motivo ? <p className="suave">Motivo: {motivo}</p> : null}
                {primera.observacion ? <p className="suave">Observación: {primera.observacion}</p> : null}
                {!compensada && !esCompensacion ? <FormCompensar operacionId={operacionId} /> : null}
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
