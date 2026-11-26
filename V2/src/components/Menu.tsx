'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Boxes,
  ClipboardCheck,
  History,
  LayoutDashboard,
  LogOut,
  PackagePlus,
  Tags,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { cerrarSesion } from '@/app/acciones';

interface Seccion {
  href: string;
  texto: string;
  icono: LucideIcon;
}

export const PESTANAS: Seccion[] = [
  { href: '/', texto: 'Dashboard General', icono: LayoutDashboard },
  { href: '/fraccionar', texto: 'Motor de Fraccionamiento', icono: Boxes },
  { href: '/auditoria', texto: 'Auditoría', icono: ClipboardCheck },
  { href: '/servicios', texto: 'Servicios', icono: Wrench },
  { href: '/movimientos', texto: 'Movimientos', icono: History },
];

const GESTION: Seccion[] = [
  { href: '/ingresos', texto: 'Ingresos', icono: PackagePlus },
  { href: '/catalogo', texto: 'Catálogo', icono: Tags },
  { href: '/usuarios', texto: 'Usuarios', icono: Users },
];

function iniciales(nombre: string): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('');
}

function Enlace({ s, actual, insignia }: { s: Seccion; actual: string; insignia?: string }) {
  const Icono = s.icono;
  return (
    <Link href={s.href} className="menu-enlace" aria-current={actual === s.href ? 'page' : undefined}>
      <Icono size={18} aria-hidden="true" />
      <span className="menu-texto">{s.texto}</span>
      {insignia ? <span className="insignia insignia-aviso">{insignia}</span> : null}
    </Link>
  );
}

/** Menú lateral (en pantallas chicas, barra superior desplazable). */
export function Menu({ nombre, rol, alertas }: { nombre: string; rol: string; alertas: number }) {
  const actual = usePathname();
  return (
    <aside className="menu">
      <div className="menu-marca">
        <span className="logo" aria-hidden="true">
          DC
        </span>
        <span className="menu-marca-texto">DETAIL CONTROL</span>
      </div>

      <div className="usuario">
        <span className="avatar" aria-hidden="true">
          {iniciales(nombre)}
        </span>
        <span className="usuario-datos">
          <strong>{nombre}</strong>
          <span>{rol}</span>
        </span>
      </div>

      <nav className="menu-nav" aria-label="Secciones">
        {PESTANAS.map((s) => (
          <Enlace
            key={s.href}
            s={s}
            actual={actual}
            insignia={s.href === '/' && alertas > 0 ? `${alertas} ${alertas === 1 ? 'alerta' : 'alertas'}` : undefined}
          />
        ))}
        <span className="menu-grupo">Gestión</span>
        {GESTION.map((s) => (
          <Enlace key={s.href} s={s} actual={actual} />
        ))}
      </nav>

      <form action={cerrarSesion} className="menu-pie">
        <button type="submit" className="menu-enlace menu-salir">
          <LogOut size={18} aria-hidden="true" />
          <span className="menu-texto">Cerrar sesión</span>
        </button>
      </form>
    </aside>
  );
}

/** Barra superior con la ubicación actual. */
export function Encabezado() {
  const actual = usePathname();
  const seccion = [...PESTANAS, ...GESTION].find((s) => s.href === actual);
  return (
    <header className="barra">
      <span className="miga">DETAIL CONTROL</span>
      <span className="miga-separador" aria-hidden="true">
        /
      </span>
      <span className="miga-actual">{seccion?.texto ?? ''}</span>
    </header>
  );
}
