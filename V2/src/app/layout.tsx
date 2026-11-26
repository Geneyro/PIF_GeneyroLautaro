import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

// Next descarga la fuente al compilar y la sirve desde la propia aplicación.
const inter = Inter({ subsets: ['latin'], display: 'swap', variable: '--fuente' });

export const metadata: Metadata = {
  title: 'DETAIL CONTROL',
  description: 'Control del consumo de insumos y servicios para estética vehicular',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#ffffff',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es-AR" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
