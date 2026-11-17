import Link from 'next/link';
import { FormLogin } from '@/components/FormLogin';
import { MarcoAuth } from '@/components/MarcoAuth';
import { MENSAJE_SIN_ENTORNO, entornoSupabase } from '@/lib/supabase/entorno';
import type { Estado } from '@/lib/tipos';

export const dynamic = 'force-dynamic';

const ERRORES: Record<string, string> = {
  enlace: 'El enlace no es válido o ya venció. Pide uno nuevo desde «¿Olvidaste tu contraseña?».',
  google: 'No se pudo iniciar sesión con Google. Inténtalo de nuevo.',
  'google-no-configurado': 'El inicio de sesión con Google todavía no está habilitado. Usa tu correo y contraseña.',
};

export default function Login({ searchParams }: { searchParams: { error?: string } }) {
  const error = searchParams.error ? ERRORES[searchParams.error] : undefined;
  const aviso: Estado = error ? { ok: false, mensaje: error } : null;

  return (
    <MarcoAuth
      titulo="Iniciar sesión"
      pie={
        <>
          ¿No tienes una cuenta? <Link href="/registro">Regístrate</Link>
        </>
      }
    >
      {entornoSupabase() ? (
        <FormLogin avisoInicial={aviso} />
      ) : (
        <p className="aviso aviso-error">{MENSAJE_SIN_ENTORNO}</p>
      )}
    </MarcoAuth>
  );
}
