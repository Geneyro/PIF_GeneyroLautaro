import { describe, expect, it } from 'vitest';
import {
  baseAMayor,
  formatCantidad,
  formatPesos,
  formatPresentacion,
  leerEnteroNoNegativo,
  leerEnteroPositivo,
  pesosACentavos,
} from '@/lib/formato';

// Los separadores de miles de Intl pueden ser espacios duros según la versión de ICU.
const plano = (s: string) => s.replace(/[  ]/g, ' ');

describe('formato de cantidades (enteros en unidad base)', () => {
  it('convierte a litros solo al mostrar, sin perder exactitud', () => {
    expect(baseAMayor(5000)).toBe('5');
    expect(baseAMayor(5250)).toBe('5,25');
    expect(baseAMayor(1)).toBe('0,001');
    expect(baseAMayor(-1500)).toBe('-1,5');
    expect(plano(baseAMayor(1_000_000))).toBe('1.000');
    expect(plano(formatCantidad(420_000, 'mL'))).toBe('420.000 mL (420 L)');
    expect(formatPresentacion(20_000, 'mL')).toBe('20 L');
    expect(formatPresentacion(5000, 'g')).toBe('5 kg');
  });

  it('5 × 1.000 mL son exactamente 5.000 mL', () => {
    expect(5 * 1000).toBe(5000);
    expect(leerEnteroPositivo('5')! * 1000).toBe(5000);
  });
});

describe('lectura de enteros', () => {
  it('acepta solo enteros positivos, con o sin puntos de miles', () => {
    expect(leerEnteroPositivo('5000')).toBe(5000);
    expect(leerEnteroPositivo('1.000.000')).toBe(1_000_000);
    expect(leerEnteroPositivo(' 12 ')).toBe(12);
    for (const malo of ['', '0', '-5', '2,5', '2.5', '1e3', 'cinco', '1.00', null]) {
      expect(leerEnteroPositivo(malo), String(malo)).toBeNull();
    }
  });

  it('la merma vacía vale 0', () => {
    expect(leerEnteroNoNegativo('')).toBe(0);
    expect(leerEnteroNoNegativo(null)).toBe(0);
    expect(leerEnteroNoNegativo('0')).toBe(0);
    expect(leerEnteroNoNegativo('1000')).toBe(1000);
    expect(leerEnteroNoNegativo('1,5')).toBeNull();
  });
});

describe('dinero en centavos enteros', () => {
  it('lee importes en pesos escritos a la argentina', () => {
    expect(pesosACentavos('2400')).toBe(240_000);
    expect(pesosACentavos('2.400.000')).toBe(240_000_000);
    expect(pesosACentavos('2400,5')).toBe(240_050);
    expect(pesosACentavos('$ 76.800,00')).toBe(7_680_000);
    expect(pesosACentavos('0,10')).toBe(10);
    // 0,1 + 0,2 en centavos es exactamente 30: no hay flotantes.
    expect(pesosACentavos('0,1')! + pesosACentavos('0,2')!).toBe(30);
  });

  it('rechaza importes ambiguos o inválidos', () => {
    for (const malo of ['', '0', '2400.50', '2,400', '1.23', '-5', 'abc', '10,123', null]) {
      expect(pesosACentavos(malo), String(malo)).toBeNull();
    }
  });

  it('muestra los centavos como pesos', () => {
    expect(plano(formatPesos(240_000_050))).toBe('$ 2.400.000,50');
    expect(plano(formatPesos(7_680_000))).toBe('$ 76.800,00');
    expect(plano(formatPesos(-150))).toBe('-$ 1,50');
  });
});
