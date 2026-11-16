'use client';

import { useFormState } from 'react-dom';
import { agregarUsuario, registrarPrimerUsuario } from '@/app/acciones';
import { LARGO_MINIMO_CLAVE } from '@/lib/usuarios';
import { Aviso, Enviar, useLimpiarAlConfirmar } from './ui';

function CamposUsuario() {
  return (
    <>
      <label className="campo">
        <span>Nombre</span>
        <input type="text" name="nombre" required maxLength={60} autoComplete="name" placeholder="Ej.: Yanina" />
      </label>
      <label className="campo">
        <span>Correo</span>
        <input type="email" name="correo" required autoComplete="off" />
      </label>
      <label className="campo">
        <span>Contraseña</span>
        <input type="password" name="clave" required minLength={LARGO_MINIMO_CLAVE} autoComplete="new-password" />
      </label>
      <p className="ayuda">Mínimo {LARGO_MINIMO_CLAVE} caracteres.</p>
    </>
  );
}

/** Puesta en marcha: organización y primer usuario. */
export function FormPrimerUsuario() {
  const [estado, accion] = useFormState(registrarPrimerUsuario, null);
  return (
    <form action={accion} className="form">
      <label className="campo">
        <span>Organización</span>
        <input type="text" name="organizacion" required maxLength={80} defaultValue="GFK Estética Vehicular" />
      </label>
      <CamposUsuario />
      <Enviar>Crear usuario y entrar</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}

/** Alta de otro usuario de la misma organización. */
export function FormNuevoUsuario() {
  const [estado, accion] = useFormState(agregarUsuario, null);
  const ref = useLimpiarAlConfirmar(estado);
  return (
    <form ref={ref} action={accion} className="form">
      <CamposUsuario />
      <Enviar>Crear usuario</Enviar>
      <Aviso estado={estado} />
    </form>
  );
}
