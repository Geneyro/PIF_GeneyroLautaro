const numero = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 3 });

export function formatCantidad(valor: number | string | null | undefined, unidad?: string): string {
  const n = Number(valor ?? 0);
  return unidad ? `${numero.format(n)} ${unidad}` : numero.format(n);
}

/** Convierte el texto de un input numérico (admite coma decimal) a número. */
export function parseNumero(texto: string | null | undefined): number | null {
  if (texto == null || texto.trim() === '') return null;
  const n = Number(texto.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

export function formatFecha(iso: string): string {
  return new Date(iso).toLocaleString('es-AR', {
    dateStyle: 'short',
    timeStyle: 'medium',
    timeZone: 'America/Argentina/Buenos_Aires',
  });
}
