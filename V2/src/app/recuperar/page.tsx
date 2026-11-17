import Link from 'next/link';
import { FormRecuperar } from '@/components/FormRecuperar';
import { MarcoAuth } from '@/components/MarcoAuth';

export const dynamic = 'force-dynamic';

export default function Recuperar() {
  return (
    <MarcoAuth
      titulo="Recuperar contraseña"
      pie={
        <>
          ¿Recordaste tu contraseña? <Link href="/login">Iniciar sesión</Link>
        </>
      }
    >
      <p className="suave">
        Ingresa el correo electrónico vinculado a tu cuenta y te enviaremos un enlace para restablecer la contraseña.
      </p>
      <FormRecuperar />
    </MarcoAuth>
  );
}
