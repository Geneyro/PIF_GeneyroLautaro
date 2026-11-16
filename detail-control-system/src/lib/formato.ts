/*
 * Formato y lectura de cantidades y dinero.
 *
 * Las cantidades viajan siempre como enteros en unidad base (mL o g) y el
 * dinero como entero en centavos. Acá no se usa aritmética de punto flotante:
 * la conversión a litros o a pesos ocurre solo al armar el texto que se muestra.
 */

import type { UnidadBase } from './tipos';

const miles = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0 });

export function formatEntero(n: number): string {
  return miles.format(n);
}

/** Unidad mayor de cada unidad base: mL → L, g → kg. */
export function unidadMayor(base: UnidadBase): 'L' | 'kg' {
  return base === 'mL' ? 'L' : 'kg';
}

/** 5000 → "5", 5250 → "5,25", -1500 → "-1,5". Sin flotantes. */
export function baseAMayor(cantidadBase: number): string {
  const negativo = cantidadBase < 0;
  const abs = Math.abs(cantidadBase);
  const entero = Math.trunc(abs / 1000);
  const resto = abs % 1000;
  const decimales = resto === 0 ? '' : ',' + String(resto).padStart(3, '0').replace(/0+$/, '');
  return (negativo ? '-' : '') + miles.format(entero) + decimales;
}

/** "5.000 mL" */
export function formatBase(cantidadBase: number, base: UnidadBase): string {
  return `${formatEntero(cantidadBase)} ${base}`;
}

/** "5.000 mL (5 L)" */
export function formatCantidad(cantidadBase: number, base: UnidadBase): string {
  return `${formatBase(cantidadBase, base)} (${baseAMayor(cantidadBase)} ${unidadMayor(base)})`;
}

/** Capacidad de una presentación: 5000 → "5 L". */
export function formatPresentacion(capacidadBase: number, base: UnidadBase): string {
  return `${baseAMayor(capacidadBase)} ${unidadMayor(base)}`;
}

/** 240000050 centavos → "$ 2.400.000,50" */
export function formatPesos(centavos: number): string {
  const negativo = centavos < 0;
  const abs = Math.abs(centavos);
  const pesos = Math.trunc(abs / 100);
  const resto = String(abs % 100).padStart(2, '0');
  return `${negativo ? '-' : ''}$ ${miles.format(pesos)},${resto}`;
}

/** Entero positivo escrito solo con dígitos (admite puntos de miles). */
export function leerEnteroPositivo(texto: string | null): number | null {
  if (!texto) return null;
  const limpio = texto.trim();
  if (!/^\d+$/.test(limpio) && !/^\d{1,3}(\.\d{3})+$/.test(limpio)) return null;
  const n = Number(limpio.replace(/\./g, ''));
  return Number.isSafeInteger(n) && n > 0 ? n : null;
}

/** Entero mayor o igual que cero; vacío se toma como 0. */
export function leerEnteroNoNegativo(texto: string | null): number | null {
  if (!texto || texto.trim() === '' || /^0+$/.test(texto.trim())) return 0;
  return leerEnteroPositivo(texto);
}

/**
 * Importe en pesos escrito a la argentina → centavos enteros.
 * "2400" → 240000 · "2.400.000" → 240000000 · "2400,5" → 240050
 * Devuelve null si el texto no es un importe válido mayor que cero.
 */
export function pesosACentavos(texto: string | null): number | null {
  if (!texto) return null;
  const limpio = texto.trim().replace(/^\$\s*/, '');
  const m = /^(\d+|\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?$/.exec(limpio);
  if (!m) return null;
  const pesos = Number(m[1].replace(/\./g, ''));
  const centavos = Number((m[2] ?? '').padEnd(2, '0'));
  const total = pesos * 100 + centavos;
  return Number.isSafeInteger(total) && total > 0 ? total : null;
}

const fechaHora = new Intl.DateTimeFormat('es-AR', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Argentina/Buenos_Aires',
});

export function formatFechaHora(iso: string): string {
  return fechaHora.format(new Date(iso));
}
