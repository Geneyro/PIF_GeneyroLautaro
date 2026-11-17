'use client';

import { useFormState } from 'react-dom';
import { intentarAlterarMovimiento } from '@/app/actions';
import { formatCantidad, formatFecha } from '@/lib/format';
import type { ActionState, Movimiento } from '@/lib/types';
import { Mensaje } from './ui';

function detalle(m: Movimiento): string {
  if (m.compartimento === 'PRESENTACION') return `${m.unidades} × ${m.presentacion_nombre}`;
  if (m.compartimento === 'MERMA') return 'Merma declarada';
  if (m.tipo === 'INGRESO' && m.cantidad_original != null) return `Ingreso de ${formatCantidad(m.cantidad_original, m.unidad_original ?? '')}`;
  return 'Extracción del granel';
}

export function TablaMovimientos({ movimientos }: { movimientos: Movimiento[] }) {
  const [estado, accion] = useFormState<ActionState, FormData>(intentarAlterarMovimiento, null);

  if (movimientos.length === 0) return <p className="vacio">Todavía no hay movimientos registrados.</p>;

  return (
    <form action={accion}>
      <Mensaje estado={estado} />
      <div className="tabla-scroll">
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Fecha</th>
              <th>Tipo</th>
              <th>Insumo</th>
              <th>Compartimento</th>
              <th>Detalle</th>
              <th className="num">Cantidad base</th>
              <th>RF-05</th>
            </tr>
          </thead>
          <tbody>
            {movimientos.map((m) => (
              <tr key={m.id}>
                <td>{m.id}</td>
                <td className="nowrap">{formatFecha(m.registrado_en)}</td>
                <td>
                  <span className={`chip chip-${m.tipo.toLowerCase()}`}>{m.tipo}</span>
                </td>
                <td>{m.insumo_nombre}</td>
                <td>{m.compartimento}</td>
                <td>{detalle(m)}</td>
                <td className={`num ${Number(m.cantidad_base) < 0 ? 'negativo' : 'positivo'}`}>
                  {Number(m.cantidad_base) > 0 ? '+' : ''}
                  {formatCantidad(m.cantidad_base, m.unidad_base)}
                </td>
                <td className="nowrap">
                  <button type="submit" name="objetivo" value={`UPDATE:${m.id}`} className="btn btn-mini">
                    Editar
                  </button>
                  <button type="submit" name="objetivo" value={`DELETE:${m.id}`} className="btn btn-mini btn-peligro">
                    Eliminar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </form>
  );
}
