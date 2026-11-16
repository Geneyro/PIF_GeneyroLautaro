import { FormLogin } from '@/components/FormLogin';
import { MENSAJE_SIN_ENTORNO, entornoSupabase } from '@/lib/supabase/entorno';

export const dynamic = 'force-dynamic';

export default function Login() {
  return (
    <main className="login">
      <div className="tarjeta">
        <h1 className="marca">DETAIL CONTROL</h1>
        <p className="suave">Control de insumos · GFK Estética Vehicular</p>
        {entornoSupabase() ? <FormLogin /> : <p className="aviso aviso-error">{MENSAJE_SIN_ENTORNO}</p>}
      </div>
    </main>
  );
}
