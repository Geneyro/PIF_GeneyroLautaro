import { PanelMovimientos } from '@/components/PanelMovimientos';
import { cargarMovimientos } from '@/lib/datos';
import { ORIGENES, armarRegistro, type Origen } from '@/lib/registro';

/** Movimientos · libro de auditoría unificado. */
export default async function Movimientos({ searchParams }: { searchParams: { origen?: string } }) {
  const filas = armarRegistro(await cargarMovimientos());
  const origen = ORIGENES.find((o) => o === searchParams.origen) as Origen | undefined;
  return <PanelMovimientos filas={filas} origen={origen} />;
}
