'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ENLACES = [
  { href: '/', texto: 'Saldos' },
  { href: '/fraccionar', texto: 'Fraccionar' },
  { href: '/ingresos', texto: 'Ingresos' },
  { href: '/catalogo', texto: 'Catálogo' },
  { href: '/movimientos', texto: 'Movimientos' },
];

export function Navegacion() {
  const ruta = usePathname();
  return (
    <nav className="nav" aria-label="Secciones">
      {ENLACES.map((e) => (
        <Link key={e.href} href={e.href} className="nav-enlace" aria-current={ruta === e.href ? 'page' : undefined}>
          {e.texto}
        </Link>
      ))}
    </nav>
  );
}
