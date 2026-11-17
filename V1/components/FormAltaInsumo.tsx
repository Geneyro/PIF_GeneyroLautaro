'use client';

import { useEffect, useRef } from 'react';
import { useFormState } from 'react-dom';
import { crearInsumo } from '@/app/actions';
import type { ActionState } from '@/lib/types';
import { Mensaje, SubmitButton } from './ui';

export function FormAltaInsumo() {
  const [estado, accion] = useFormState<ActionState, FormData>(crearInsumo, null);
  const form = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (estado?.ok) form.current?.reset();
  }, [estado]);

  return (
    <form ref={form} action={accion} className="formulario">
      <label>
        Nombre del insumo
        <input name="nombre" required placeholder="Ej.: Shampoo neutro" autoComplete="off" />
      </label>
      <label>
        Unidad base
        <select name="unidad_base" defaultValue="mL">
          <option value="mL">mililitros (mL) — líquidos</option>
          <option value="g">gramos (g) — sólidos / pastas</option>
        </select>
      </label>
      <SubmitButton>Dar de alta</SubmitButton>
      <Mensaje estado={estado} />
    </form>
  );
}
