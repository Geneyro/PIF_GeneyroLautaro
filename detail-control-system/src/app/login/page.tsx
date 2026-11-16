import Link from 'next/link';
import { FormLogin } from '@/components/FormLogin';
import { crearClienteAdmin } from '@/lib/supabase/admin';
import { MENSAJE_SIN_ENTORNO, entornoSupabase } from '@/lib/supabase/entorno';
import { hayUsuarios } from '@/lib/usuarios';

export const dynamic = 'force-dynamic';

/** El enlace de puesta en marcha solo se muestra mientras no exista ningún usuario. */
async function sistemaSinUsuarios(): Promise<boolean> {
  try {
    return !(await hayUsuarios(crearClienteAdmin()));
  } catch {
    return false;
  }
}

export default async function Login() {
  const configurado = entornoSupabase() !== null;
  const sinUsuarios = configurado && (await sistemaSinUsuarios());

  return (
    <main className="login">
      <div className="tarjeta">
        <h1 className="marca">DETAIL CONTROL</h1>
        <p className="suave">Control de insumos · GFK Estética Vehicular</p>
        {configurado ? <FormLogin /> : <p className="aviso aviso-error">{MENSAJE_SIN_ENTORNO}</p>}
        {sinUsuarios ? (
          <p className="suave pie">
            Todavía no hay usuarios. <Link href="/registro">Crear el primer usuario</Link>
          </p>
        ) : null}
      </div>
    </main>
  );
}
