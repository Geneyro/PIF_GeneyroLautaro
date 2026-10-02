'use client';

import { useFormStatus } from 'react-dom';
import type { ActionState } from '@/lib/types';

export function SubmitButton({ children, variante = 'primario' }: { children: React.ReactNode; variante?: 'primario' | 'secundario' }) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" className={`btn btn-${variante}`} disabled={pending} aria-busy={pending}>
      {pending ? 'Procesando…' : children}
    </button>
  );
}

export function Mensaje({ estado }: { estado: ActionState }) {
  if (!estado) return null;
  return (
    <div className={`mensaje ${estado.ok ? 'mensaje-ok' : 'mensaje-error'}`} role={estado.ok ? 'status' : 'alert'}>
      <strong>{estado.ok ? '✔ ' : '✖ '}</strong>
      {estado.mensaje}
      {estado.detalle && <p className="mensaje-detalle">{estado.detalle}</p>}
    </div>
  );
}
