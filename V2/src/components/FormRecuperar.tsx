'use client';

import { useFormState } from 'react-dom';
import { restablecerClave, solicitarRecuperacion } from '@/app/acciones';
import { LARGO_MINIMO_CLAVE } from '@/lib/cuentas';
import { Aviso, Enviar, useLimpiarAlConfirmar } from './ui';

/** Paso 1: pedir el enlace de recuperación por correo. */
export function FormRecuperar() {
  const [estado, accion] = useFormState(solicitarRecuperacion, null);
  const ref = useLimpiarAlConfirmar(estado);

  return (
    <form ref={ref} action={accion} className="form">
      <label className="campo">
        <span>Correo electrónico</span>
        <input type="email" name="correo" autoComplete="email" required autoFocus />
      </label>
      <Enviar>Enviar enlace</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}

/** Paso 2: elegir la contraseña nueva, después de abrir el enlace del correo. */
export function FormRestablecer() {
  const [estado, accion] = useFormState(restablecerClave, null);

  return (
    <form action={accion} className="form">
      <label className="campo">
        <span>Nueva contraseña</span>
        <input type="password" name="clave" autoComplete="new-password" required minLength={LARGO_MINIMO_CLAVE} autoFocus />
      </label>
      <label className="campo">
        <span>Confirmar contraseña</span>
        <input type="password" name="confirmacion" autoComplete="new-password" required minLength={LARGO_MINIMO_CLAVE} />
      </label>
      <p className="ayuda">Mínimo {LARGO_MINIMO_CLAVE} caracteres.</p>
      <Enviar>Guardar contraseña</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
