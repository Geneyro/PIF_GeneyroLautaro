import { FormIngreso } from '@/components/FormIngreso';
import { cargarProveedores, cargarSaldos } from '@/lib/datos';

/** RF-03 · Ingreso de insumo (contenedor o compra). */
export default async function Ingresos() {
  const [{ insumos }, proveedores] = await Promise.all([cargarSaldos(), cargarProveedores()]);

  return (
    <>
      <h1>Ingresos</h1>
      <section className="tarjeta angosta">
        <h2>Registrar ingreso</h2>
        <FormIngreso insumos={insumos} proveedores={proveedores} />
      </section>
    </>
  );
}
