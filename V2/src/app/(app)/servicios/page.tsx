import { FormServicio } from '@/components/FormServicio';
import { cargarConsumos, cargarSaldos } from '@/lib/datos';
import { formatBase, formatFechaHora } from '@/lib/formato';
import type { Movimiento } from '@/lib/tipos';

/** Servicios · registro de servicios del taller y su consumo de insumos. */
export default async function Servicios() {
  const [{ insumos }, consumos] = await Promise.all([cargarSaldos(), cargarConsumos()]);

  const servicios = new Map<string, Movimiento[]>();
  for (const m of consumos) {
    const lineas = servicios.get(m.operacion_id);
    if (lineas) lineas.push(m);
    else servicios.set(m.operacion_id, [m]);
  }
  const recientes = [...servicios.values()].slice(0, 10);

  return (
    <>
      <div className="titulo">
        <h1>Servicios</h1>
        <p className="suave">Registrá cada servicio con su receta: los insumos usados se descuentan del stock a granel.</p>
      </div>

      <div className="columnas">
        <FormServicio insumos={insumos} />

        <section className="tarjeta" aria-labelledby="titulo-recientes">
          <div className="tarjeta-cabecera">
            <h2 id="titulo-recientes">Últimos servicios</h2>
          </div>
          {recientes.length === 0 ? (
            <p className="vacio">Todavía no se registraron servicios.</p>
          ) : (
            <ul className="lista-servicios">
              {recientes.map((lineas) => {
                const m = lineas[0];
                return (
                  <li key={m.operacion_id}>
                    <div className="servicio-cabecera">
                      <strong>{m.servicio_nombre}</strong>
                      <span className="etiqueta">{m.servicio_vehiculo}</span>
                    </div>
                    <p className="suave">
                      {formatFechaHora(m.registrado_en)} · {m.usuario_nombre ?? 'Usuario desconocido'}
                      {lineas.some((l) => l.compensado) ? ' · anulado' : ''}
                    </p>
                    <ul className="consumos">
                      {lineas.map((l) => (
                        <li key={l.id}>
                          <span>{l.insumo_nombre}</span>
                          <span className="num">{formatBase(-l.cantidad_base, l.unidad_base)}</span>
                        </li>
                      ))}
                    </ul>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
