import { FormEstadoInsumo, FormPuntoPedido } from '@/components/FormAjustesInsumo';
import { FormInsumo } from '@/components/FormInsumo';
import { FormPresentacion } from '@/components/FormPresentacion';
import { cargarInsumosDeBaja, cargarSaldos } from '@/lib/datos';
import { formatPresentacion } from '@/lib/formato';
import { TAMANOS_PRESENTACION } from '@/lib/tipos';

/** RF-02 · Catálogo de insumos a granel, presentaciones y punto de pedido. */
export default async function Catalogo() {
  const [{ insumos, presentaciones }, deBaja] = await Promise.all([cargarSaldos(), cargarInsumosDeBaja()]);

  return (
    <>
      <div className="titulo">
        <h1>Catálogo</h1>
        <p className="suave">Insumos a granel, sus presentaciones y el punto de pedido que activa la alerta de reposición.</p>
      </div>

      <div className="columnas">
        <section className="tarjeta" aria-labelledby="titulo-insumos">
          <div className="tarjeta-cabecera">
            <h2 id="titulo-insumos">Insumos</h2>
          </div>
          {insumos.length === 0 ? (
            <p className="vacio">Todavía no hay insumos.</p>
          ) : (
            <ul className="lista">
              {insumos.map((i) => {
                const pres = presentaciones.filter((p) => p.insumo_id === i.insumo_id);
                const faltantes = TAMANOS_PRESENTACION.filter((t) => !pres.some((p) => p.capacidad_base === t * 1000));
                return (
                  <li key={i.insumo_id}>
                    <div className="servicio-cabecera">
                      <strong>{i.nombre}</strong>
                      <span className="etiqueta">{i.unidad_base}</span>
                    </div>
                    <p className="suave">
                      {pres.length === 0
                        ? 'Sin presentaciones.'
                        : 'Presentaciones: ' + pres.map((p) => formatPresentacion(p.capacidad_base, i.unidad_base)).join(' · ')}
                    </p>
                    <div className="ajustes">
                      <FormPuntoPedido insumoId={i.insumo_id} unidadBase={i.unidad_base} actual={i.punto_pedido} />
                      <FormPresentacion insumoId={i.insumo_id} unidadBase={i.unidad_base} faltantes={[...faltantes]} />
                      <FormEstadoInsumo insumoId={i.insumo_id} activo />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <div className="pila">
          <section className="tarjeta" aria-labelledby="titulo-nuevo">
            <div className="tarjeta-cabecera">
              <h2 id="titulo-nuevo">Nuevo insumo</h2>
            </div>
            <FormInsumo />
          </section>

          {deBaja.length > 0 ? (
            <section className="tarjeta" aria-labelledby="titulo-baja">
              <div className="tarjeta-cabecera">
                <h2 id="titulo-baja">Dados de baja</h2>
              </div>
              <ul className="lista">
                {deBaja.map((i) => (
                  <li key={i.insumo_id} className="servicio-cabecera">
                    <span>{i.nombre}</span>
                    <FormEstadoInsumo insumoId={i.insumo_id} activo={false} />
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}
