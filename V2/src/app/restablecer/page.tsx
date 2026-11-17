import { FormRestablecer } from '@/components/FormRecuperar';
import { MarcoAuth } from '@/components/MarcoAuth';

export const dynamic = 'force-dynamic';

/** Se llega desde el enlace del correo de recuperación, que abre la sesión. */
export default function Restablecer() {
  return (
    <MarcoAuth titulo="Nueva contraseña">
      <FormRestablecer />
    </MarcoAuth>
  );
}
