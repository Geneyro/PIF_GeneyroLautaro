import { FormInsumo } from '@/components/FormInsumo';
import { FormPresentacion } from '@/components/FormPresentacion';
import { cargarSaldos } from '@/lib/datos';
import { formatPresentacion } from '@/lib/formato';
import { TAMANOS_PRESENTACION } from '@/lib/tipos';

/** RF-02 · Catálogo de insumos a granel y sus presentaciones. */
export default async function Catalogo() {
  const { insumos, presentaciones } = await cargarSaldos();

  return (
    <>
      <h1>Catálogo</h1>
      <div className="dos-columnas">
        <section className="tarjeta">
          <h2>Nuevo insumo</h2>
          <FormInsumo />
        </section>

        <section className="tarjeta">
          <h2>Insumos</h2>
          {insumos.length === 0 ? (
            <p className="vacio">Todavía no hay insumos.</p>
          ) : (
            <ul className="lista">
              {insumos.map((i) => {
                const pres = presentaciones.filter((p) => p.insumo_id === i.insumo_id);
                const faltantes = TAMANOS_PRESENTACION.filter((t) => !pres.some((p) => p.capacidad_base === t * 1000));
                return (
                  <li key={i.insumo_id}>
                    <strong>{i.nombre}</strong> <span className="etiqueta">{i.unidad_base}</span>
                    <p className="suave">
                      {pres.length === 0
                        ? 'Sin presentaciones.'
                        : 'Presentaciones: ' + pres.map((p) => formatPresentacion(p.capacidad_base, i.unidad_base)).join(' · ')}
                    </p>
                    <FormPresentacion insumoId={i.insumo_id} unidadBase={i.unidad_base} faltantes={[...faltantes]} />
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
