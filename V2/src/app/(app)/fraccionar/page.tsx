import { FormFraccionamiento } from '@/components/FormFraccionamiento';
import { cargarSaldos } from '@/lib/datos';

/** RF-01 · Fraccionamiento de un insumo a granel en presentaciones. */
export default async function Fraccionar() {
  const { insumos, presentaciones } = await cargarSaldos();

  return (
    <>
      <h1>Fraccionar</h1>
      <section className="tarjeta angosta">
        <h2>Registrar fraccionamiento</h2>
        <p className="suave">
          Solo se confirma si las unidades generadas más la merma igualan la cantidad tomada del origen.
        </p>
        <FormFraccionamiento insumos={insumos} presentaciones={presentaciones} />
      </section>
    </>
  );
}
