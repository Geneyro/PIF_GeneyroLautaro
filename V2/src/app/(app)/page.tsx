import { PanelDashboard } from '@/components/PanelDashboard';
import { cargarSaldos } from '@/lib/datos';

/** Dashboard General · saldos a granel y alertas de reposición. */
export default async function Dashboard() {
  const { insumos } = await cargarSaldos();
  return <PanelDashboard insumos={insumos} />;
}
