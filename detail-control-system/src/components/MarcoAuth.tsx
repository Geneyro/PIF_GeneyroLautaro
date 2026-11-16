/**
 * Marco de las pantallas de acceso (iniciar sesión, registro, recuperación).
 *
 * En pantalla ancha, «DETAIL CONTROL» va alineado a la izquierda en la parte
 * superior de la tarjeta. En pantalla angosta queda por encima de la tarjeta.
 * Lo resuelve solo el CSS (.auth-marco / .auth-tarjeta en globals.css).
 */
export function MarcoAuth({
  titulo,
  children,
  pie,
}: {
  titulo: string;
  children: React.ReactNode;
  pie?: React.ReactNode;
}) {
  return (
    <main className="auth">
      <div className="auth-marco">
        <p className="auth-marca">DETAIL CONTROL</p>
        <section className="auth-tarjeta" aria-labelledby="auth-titulo">
          <h1 id="auth-titulo">{titulo}</h1>
          {children}
          {pie ? <p className="auth-pie">{pie}</p> : null}
        </section>
      </div>
    </main>
  );
}
