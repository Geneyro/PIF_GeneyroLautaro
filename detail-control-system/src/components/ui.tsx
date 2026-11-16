'use client';

import { useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import type { Estado } from '@/lib/tipos';

/** Mensaje de resultado de una acción: confirmación o rechazo de la base. */
export function Aviso({ estado }: { estado: Estado }) {
  if (!estado || estado.mensaje === '') return null;
  return (
    <div className={estado.ok ? 'aviso aviso-ok' : 'aviso aviso-error'} role={estado.ok ? 'status' : 'alert'}>
      <strong>{estado.ok ? 'Confirmado' : 'Rechazado'}</strong>
      <p>{estado.mensaje}</p>
      {estado.detalle ? <p className="aviso-detalle">{estado.detalle}</p> : null}
    </div>
  );
}

export function Enviar({ children, secundario = false }: { children: React.ReactNode; secundario?: boolean }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={secundario ? 'boton boton-secundario' : 'boton'} disabled={pending}>
      {pending ? 'Enviando…' : children}
    </button>
  );
}

/** Limpia el formulario cuando la acción fue confirmada. */
export function useLimpiarAlConfirmar(estado: Estado) {
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado?.ok) ref.current?.reset();
  }, [estado]);
  return ref;
}
