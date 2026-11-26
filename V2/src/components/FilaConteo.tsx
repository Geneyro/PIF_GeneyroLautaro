'use client';

import { useEffect, useState } from 'react';
import { useFormState } from 'react-dom';
import { registrarConteo } from '@/app/acciones';
import { formatBase, leerEnteroNoNegativo } from '@/lib/formato';
import type { SaldoInsumo } from '@/lib/tipos';
import { Enviar } from './ui';

/** Insumos · conteo físico: una fila por insumo: saldo del sistema, conteo y diferencia. */
export function FilaConteo({ insumo }: { insumo: SaldoInsumo }) {
  const [estado, accion] = useFormState(registrarConteo, null);
  const [conteo, setConteo] = useState('');

  useEffect(() => {
    if (estado?.ok) setConteo('');
  }, [estado]);

  const base = insumo.unidad_base;
  const contado = conteo.trim() === '' ? null : leerEnteroNoNegativo(conteo);
  const diferencia = contado === null ? null : contado - insumo.saldo_granel;
  const formulario = `conteo-${insumo.insumo_id}`;

  return (
    <tr>
      <td>
        <strong>{insumo.nombre}</strong>
      </td>
      <td className="num cifra-destacada">{formatBase(insumo.saldo_granel, base)}</td>
      <td>
        <label className="campo-tabla">
          <span className="oculto">Conteo físico de {insumo.nombre} en {base}</span>
          <input
            form={formulario}
            name="conteo"
            inputMode="numeric"
            placeholder="Contado"
            value={conteo}
            onChange={(e) => setConteo(e.target.value)}
            aria-invalid={conteo.trim() !== '' && contado === null}
          />
          <span className="unidad">{base}</span>
        </label>
      </td>
      <td className="num">
        {diferencia === null ? (
          <span className="suave">—</span>
        ) : (
          <span className={diferencia < 0 ? 'cifra-negativa' : diferencia > 0 ? 'cifra-positiva' : 'suave'}>
            {diferencia > 0 ? '+' : ''}
            {formatBase(diferencia, base)}
          </span>
        )}
      </td>
      <td className="acciones-fila">
        <form id={formulario} action={accion}>
          <input type="hidden" name="insumo_id" value={insumo.insumo_id} />
          <Enviar chico secundario={diferencia === 0} deshabilitado={contado === null}>
            {diferencia === 0 ? 'Confirmar conteo' : 'Ajustar stock'}
          </Enviar>
        </form>
        {estado ? (
          <span className={estado.ok ? 'resultado resultado-ok' : 'resultado resultado-error'} role={estado.ok ? 'status' : 'alert'}>
            {estado.mensaje}
          </span>
        ) : null}
      </td>
    </tr>
  );
}
