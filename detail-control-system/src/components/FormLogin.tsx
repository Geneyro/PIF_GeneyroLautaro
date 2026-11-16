'use client';

import { useFormState } from 'react-dom';
import { iniciarSesion } from '@/app/acciones';
import { Aviso, Enviar } from './ui';

export function FormLogin() {
  const [estado, accion] = useFormState(iniciarSesion, null);
  return (
    <form action={accion} className="form">
      <label className="campo">
        <span>Correo</span>
        <input type="email" name="correo" autoComplete="username" required autoFocus />
      </label>
      <label className="campo">
        <span>Contraseña</span>
        <input type="password" name="clave" autoComplete="current-password" required />
      </label>
      <Enviar>Iniciar sesión</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
