import Link from 'next/link';
import { redirect } from 'next/navigation';
import { FormPrimerUsuario } from '@/components/FormUsuario';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { hayUsuarios } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

/**
 * Puesta en marcha del sistema. Solo está disponible mientras no exista ningún
 * usuario; a partir del primero, las altas se hacen desde «Usuarios», con sesión.
 */
export default async function Registro() {
  let error: string | null = null;
  let cerrado = false;
  try {
    cerrado = await hayUsuarios(crearClienteAdmin());
  } catch (e) {
    error = e instanceof Error ? e.message : 'No se pudo consultar el sistema.';
  }
  if (cerrado) redirect('/login');

  return (
    <main className="login">
      <div className="tarjeta">
        <h1 className="marca">DETAIL CONTROL</h1>
        <p className="suave">Puesta en marcha: creá el primer usuario del sistema.</p>
        {error ? <p className="aviso aviso-error">{error}</p> : <FormPrimerUsuario />}
        <p className="suave pie">
          <Link href="/login">Volver al inicio de sesión</Link>
        </p>
      </div>
    </main>
  );
}
