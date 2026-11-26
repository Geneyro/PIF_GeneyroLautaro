import { FormFraccionar } from '@/components/FormFraccionar';
import { cargarSaldos } from '@/lib/datos';
import { formatBase, formatEntero, formatPresentacion } from '@/lib/formato';

/** Motor de Fraccionamiento · del granel a presentaciones menores. */
export default async function MotorDeFraccionamiento() {
  const { insumos, presentaciones } = await cargarSaldos();
  const enExistencia = presentaciones.filter((p) => p.unidades_en_existencia > 0);

  return (
    <>
      <div className="titulo">
        <h1>Motor de Fraccionamiento</h1>
        <p className="suave">Transformá insumo a granel en presentaciones menores. El stock se descuenta al confirmar.</p>
      </div>

      <div className="columnas">
        <FormFraccionar insumos={insumos} presentaciones={presentaciones} />

        <section className="tarjeta tarjeta-tabla" aria-labelledby="titulo-fraccionado">
          <div className="tarjeta-cabecera">
            <h2 id="titulo-fraccionado">Stock fraccionado</h2>
          </div>
          {enExistencia.length === 0 ? (
            <p className="vacio">Todavía no hay unidades fraccionadas.</p>
          ) : (
            <div className="tabla-contenedor">
              <table>
                <thead>
                  <tr>
                    <th>Insumo</th>
                    <th>Presentación</th>
                    <th className="num">Unidades</th>
                    <th className="num">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {enExistencia.map((p) => (
                    <tr key={p.presentacion_id}>
                      <td>{p.insumo_nombre}</td>
                      <td>{formatPresentacion(p.capacidad_base, p.unidad_base)}</td>
                      <td className="num">{formatEntero(p.unidades_en_existencia)}</td>
                      <td className="num">{formatBase(p.saldo_base, p.unidad_base)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
