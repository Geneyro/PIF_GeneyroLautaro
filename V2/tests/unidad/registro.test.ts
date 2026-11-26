import { describe, expect, it } from 'vitest';
import { armarRegistro, formatVariacion } from '@/lib/registro';
import type { Movimiento } from '@/lib/tipos';

let id = 100;
function linea(cambio: Partial<Movimiento>): Movimiento {
  return {
    id: id--,
    operacion_id: 'op',
    tipo: 'CONSUMO',
    compartimento: 'GRANEL',
    insumo_id: 'i1',
    insumo_nombre: 'Citrolimp',
    unidad_base: 'mL',
    presentacion_id: null,
    capacidad_base: null,
    unidades: null,
    cantidad_base: -100,
    proveedor_nombre: null,
    costo_centavos: null,
    motivo: null,
    observacion: null,
    movimiento_origen_id: null,
    compensado: false,
    usuario_id: 'u',
    usuario_nombre: 'Guido',
    registrado_en: '2026-11-25T12:00:00Z',
    servicio_nombre: null,
    servicio_vehiculo: null,
    conteo_fisico: null,
    conteo_saldo_sistema: null,
    tipo_origen: null,
    ...cambio,
  };
}

describe('libro de auditoría unificado', () => {
  it('una fila por operación e insumo, con origen, variación a granel y detalle', () => {
    const filas = armarRegistro([
      linea({ operacion_id: 'serv', insumo_id: 'a', insumo_nombre: 'Mekasil Ultra', cantidad_base: -150, servicio_nombre: 'Lavado', servicio_vehiculo: 'SUV' }),
      linea({ operacion_id: 'serv', insumo_id: 'b', insumo_nombre: 'Citrolimp', cantidad_base: -80, servicio_nombre: 'Lavado', servicio_vehiculo: 'SUV' }),
      linea({ operacion_id: 'frac', tipo: 'FRACCIONAMIENTO', compartimento: 'PRESENTACION', capacidad_base: 1000, unidades: 5, cantidad_base: 5000 }),
      linea({ operacion_id: 'frac', tipo: 'FRACCIONAMIENTO', cantidad_base: -5000 }),
      linea({ operacion_id: 'aud', tipo: 'AJUSTE', cantidad_base: -500, motivo: 'Conteo físico', conteo_fisico: 9500, conteo_saldo_sistema: 10000 }),
    ]);

    expect(filas.map((f) => [f.origen, f.insumo, f.variacion, f.detalle, f.anulable])).toEqual([
      ['Servicios', 'Mekasil Ultra', -150, 'Lavado · SUV', true],
      ['Servicios', 'Citrolimp', -80, 'Lavado · SUV', false], // se anula una vez, desde la primera fila
      ['Motor de Fraccionamiento', 'Citrolimp', -5000, '5 × 1 L', true],
      ['Auditoría', 'Citrolimp', -500, 'Sistema 10.000 mL · contado 9.500 mL', true],
    ]);
  });

  it('las correcciones dicen qué anulan y la operación anulada ya no se puede anular', () => {
    const filas = armarRegistro([
      linea({ operacion_id: 'corr', tipo: 'COMPENSACION', cantidad_base: 100, motivo: 'Cargado dos veces', tipo_origen: 'CONSUMO', movimiento_origen_id: 1 }),
      linea({ operacion_id: 'serv', compensado: true, servicio_nombre: 'Pulido', servicio_vehiculo: 'Moto' }),
    ]);
    expect(filas[0]).toMatchObject({ origen: 'Corrección', detalle: 'Anula consumo de servicio · Cargado dos veces', anulable: false });
    expect(filas[1]).toMatchObject({ anulada: true, anulable: false });
  });

  it('muestra la variación con signo', () => {
    expect(formatVariacion(1500, 'mL')).toBe('+1.500 mL');
    expect(formatVariacion(-200, 'mL')).toBe('-200 mL');
    expect(formatVariacion(0, 'g')).toBe('0 g');
  });
});
