// Habilita «Continuar con Google» en el proyecto de Supabase.
//
// Con Supabase Auth, las credenciales de Google se guardan en Supabase (no en
// Vercel): Supabase habla con Google y la aplicación solo recibe la sesión.
//
// Uso: completar en .env.local
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET   (Google Cloud Console)
//   SUPABASE_ACCESS_TOKEN                    (supabase.com/dashboard/account/tokens)
//   SUPABASE_PROJECT_REF                     (Project Settings → General)
// y ejecutar: npm run auth:google

const requeridas = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'SUPABASE_ACCESS_TOKEN', 'SUPABASE_PROJECT_REF'];
const faltantes = requeridas.filter((nombre) => !process.env[nombre]);
if (faltantes.length > 0) {
  console.error(`Faltan variables en .env.local: ${faltantes.join(', ')}`);
  process.exit(1);
}

const ref = process.env.SUPABASE_PROJECT_REF;
const respuesta = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
  method: 'PATCH',
  headers: {
    Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    external_google_enabled: true,
    external_google_client_id: process.env.GOOGLE_CLIENT_ID,
    external_google_secret: process.env.GOOGLE_CLIENT_SECRET,
    // Necesario para que Google pueda crear cuentas nuevas. Toda cuenta nueva
    // queda pendiente hasta que un administrador la aprueba.
    disable_signup: false,
  }),
});

if (!respuesta.ok) {
  console.error(`Supabase respondió ${respuesta.status}: ${await respuesta.text()}`);
  process.exit(1);
}

console.log('Listo: «Continuar con Google» quedó habilitado en Supabase.');
console.log(`En Google Cloud Console, la URI de redirección autorizada debe ser: https://${ref}.supabase.co/auth/v1/callback`);
