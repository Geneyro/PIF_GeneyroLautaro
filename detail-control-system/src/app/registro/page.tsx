import Link from 'next/link';
import { FormRegistro } from '@/components/FormRegistro';
import { MarcoAuth } from '@/components/MarcoAuth';

export const dynamic = 'force-dynamic';

export default function Registro() {
  return (
    <MarcoAuth
      titulo="Crear cuenta"
      pie={
        <>
          ¿Ya tienes una cuenta? <Link href="/login">Iniciar sesión</Link>
        </>
      }
    >
      <FormRegistro />
    </MarcoAuth>
  );
}
