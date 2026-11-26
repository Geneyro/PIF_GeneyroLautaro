'use client';

import Link from 'next/link';
import { useFormState } from 'react-dom';
import { iniciarSesion } from '@/app/acciones';
import type { Estado } from '@/lib/tipos';
import { Aviso, Enviar } from './ui';

/** Pantalla principal: correo, contraseña y acceso a la recuperación. */
export function FormLogin({ avisoInicial }: { avisoInicial: Estado }) {
  const [estado, accion] = useFormState(iniciarSesion, null);

  return (
    <form action={accion} className="form">
      <label className="campo">
        <span>Correo electrónico</span>
        <input type="email" name="correo" autoComplete="email" required autoFocus />
      </label>
      <label className="campo">
        <span>Contraseña</span>
        <input type="password" name="clave" autoComplete="current-password" required />
      </label>
      <Link href="/recuperar" className="enlace-olvido">
        ¿Olvidaste tu contraseña?
      </Link>
      <Enviar>Iniciar sesión</Enviar>
      <Aviso estado={estado ?? avisoInicial} />
    </form>
  );
}
