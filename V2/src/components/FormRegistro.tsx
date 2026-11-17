'use client';

import { useFormState } from 'react-dom';
import { crearCuenta } from '@/app/acciones';
import { LARGO_MINIMO_CLAVE, ROLES } from '@/lib/cuentas';
import { Aviso, Enviar } from './ui';

/** Crear cuenta. Nombre, correo, contraseña (dos veces) y rol. */
export function FormRegistro() {
  const [estado, accion] = useFormState(crearCuenta, null);

  return (
    <form action={accion} className="form">
      <label className="campo">
        <span>Nombre completo</span>
        <input type="text" name="nombre" autoComplete="name" required maxLength={120} autoFocus />
      </label>
      <label className="campo">
        <span>Correo electrónico</span>
        <input type="email" name="correo" autoComplete="email" required />
      </label>
      <label className="campo">
        <span>Contraseña</span>
        <input type="password" name="clave" autoComplete="new-password" required minLength={LARGO_MINIMO_CLAVE} />
      </label>
      <label className="campo">
        <span>Confirmar contraseña</span>
        <input type="password" name="confirmacion" autoComplete="new-password" required minLength={LARGO_MINIMO_CLAVE} />
      </label>
      <p className="ayuda">Mínimo {LARGO_MINIMO_CLAVE} caracteres.</p>

      <fieldset className="campo">
        <legend>Rol</legend>
        <div className="opciones">
          {ROLES.map((r) => (
            <label key={r.valor} className="opcion">
              <input type="radio" name="rol" value={r.valor} required defaultChecked={r.valor === 'OPERARIO'} />
              {r.texto}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="ayuda">Un administrador revisará y aprobará tu cuenta antes de que puedas operar.</p>

      <Enviar>Crear cuenta</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
