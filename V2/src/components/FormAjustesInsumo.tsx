'use client';

import { useFormState } from 'react-dom';
import { Plus, Trash2 } from 'lucide-react';
import { agregarInsumo, cambiarEstadoInsumo, definirPuntoPedido } from '@/app/acciones';
import type { UnidadBase } from '@/lib/tipos';
import { Aviso, Enviar, useLimpiarAlConfirmar } from './ui';

/** Alta de un insumo a granel. La base le crea las presentaciones de 1 a 120 L. */
export function FormAgregarInsumo() {
  const [estado, accion] = useFormState(agregarInsumo, null);
  const ref = useLimpiarAlConfirmar(estado);
  return (
    <form ref={ref} action={accion} className="pila">
      <div className="form-linea">
        <label className="campo">
          <span>Nombre del insumo</span>
          <input type="text" name="nombre" required maxLength={80} placeholder="Ej.: Citrolimp" />
        </label>
        <label className="campo campo-unidad">
          <span>Unidad</span>
          <select name="unidad_base" defaultValue="mL">
            <option value="mL">Líquido (mL)</option>
            <option value="g">Sólido (g)</option>
          </select>
        </label>
        <Enviar>
          <Plus size={16} aria-hidden="true" /> Agregar insumo
        </Enviar>
      </div>
      <Aviso estado={estado} />
    </form>
  );
}

/** Punto de pedido del insumo, en unidad base. Vacío: sin alerta. */
export function FormPuntoPedido({
  insumoId,
  nombre,
  unidadBase,
  actual,
}: {
  insumoId: string;
  nombre: string;
  unidadBase: UnidadBase;
  actual: number | null;
}) {
  const [estado, accion] = useFormState(definirPuntoPedido, null);
  return (
    <form action={accion} className="form-linea">
      <input type="hidden" name="insumo_id" value={insumoId} />
      <label className="campo-tabla">
        <span className="oculto">
          Punto de pedido de {nombre} en {unidadBase}
        </span>
        <input name="punto" inputMode="numeric" defaultValue={actual ?? ''} placeholder="Sin alerta" />
        <span className="unidad">{unidadBase}</span>
      </label>
      <Enviar secundario chico>
        Guardar
      </Enviar>
      {estado ? (
        <span className={estado.ok ? 'resultado resultado-ok' : 'resultado resultado-error'} role={estado.ok ? 'status' : 'alert'}>
          {estado.mensaje}
        </span>
      ) : null}
    </form>
  );
}

/** Eliminación (baja lógica): el insumo deja de mostrarse y su historial se conserva. */
export function FormEliminarInsumo({ insumoId, nombre }: { insumoId: string; nombre: string }) {
  const [estado, accion] = useFormState(cambiarEstadoInsumo, null);
  return (
    <form
      action={accion}
      onSubmit={(e) => {
        if (!window.confirm(`¿Eliminar ${nombre}? Deja de aparecer en el sistema, pero su historial de movimientos se conserva.`)) {
          e.preventDefault();
        }
      }}
    >
      <input type="hidden" name="insumo_id" value={insumoId} />
      <input type="hidden" name="activo" value="false" />
      <button type="submit" className="boton-icono" aria-label={`Eliminar ${nombre}`} title={`Eliminar ${nombre}`}>
        <Trash2 size={16} aria-hidden="true" />
      </button>
      {estado && !estado.ok ? (
        <span className="resultado resultado-error" role="alert">
          {estado.mensaje}
        </span>
      ) : null}
    </form>
  );
}
