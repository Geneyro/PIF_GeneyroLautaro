import { describe, expect, it } from 'vitest';
import { esCorreoDuplicado, normalizarCorreo, textoRol, validarClave, validarRegistro } from '@/lib/cuentas';

const valido = {
  nombre: 'Yanina Brixer',
  correo: 'yanina@ejemplo.com',
  clave: 'una-clave-segura',
  confirmacion: 'una-clave-segura',
  rol: 'OPERARIO',
};

describe('validación del registro', () => {
  it('acepta un registro completo y normaliza nombre y correo', () => {
    const r = validarRegistro({ ...valido, nombre: '  Yanina   Brixer ', correo: ' Yanina@Ejemplo.COM ' });
    expect(r).toEqual({
      ok: true,
      datos: { nombre: 'Yanina Brixer', correo: 'yanina@ejemplo.com', clave: 'una-clave-segura', rol: 'OPERARIO' },
    });
  });

  it('rechaza cada campo inválido con un mensaje claro', () => {
    const casos: [Partial<typeof valido>, RegExp][] = [
      [{ nombre: '   ' }, /nombre completo/],
      [{ nombre: 'x'.repeat(121) }, /demasiado largo/],
      [{ correo: 'sin-arroba' }, /correo electrónico válido/],
      [{ correo: 'a@b' }, /correo electrónico válido/],
      [{ clave: '1234567', confirmacion: '1234567' }, /al menos 8/],
      [{ confirmacion: 'otra-clave-distinta' }, /no coinciden/],
      [{ rol: 'JEFE' }, /Selecciona un rol/],
      [{ rol: null as unknown as string }, /Selecciona un rol/],
    ];
    for (const [cambio, motivo] of casos) {
      const r = validarRegistro({ ...valido, ...cambio });
      expect(r.ok, JSON.stringify(cambio)).toBe(false);
      if (!r.ok) expect(r.mensaje).toMatch(motivo);
    }
  });

  it('la contraseña no se recorta ni se altera', () => {
    const r = validarRegistro({ ...valido, clave: '  espacios  ', confirmacion: '  espacios  ' });
    expect(r.ok && r.datos.clave).toBe('  espacios  ');
  });
});

describe('contraseñas', () => {
  it('exige mínimo 8 caracteres y que coincida la confirmación', () => {
    expect(validarClave('12345678', '12345678')).toBeNull();
    expect(validarClave(null, null)).toMatch(/al menos 8/);
    expect(validarClave('12345678', '12345679')).toMatch(/no coinciden/);
  });

  it('rechaza lo que bcrypt no puede considerar (más de 72 bytes)', () => {
    expect(validarClave('a'.repeat(72), 'a'.repeat(72))).toBeNull();
    expect(validarClave('a'.repeat(73), 'a'.repeat(73))).toMatch(/demasiado larga/);
    // 37 eñes son 74 bytes en UTF-8.
    expect(validarClave('ñ'.repeat(37), 'ñ'.repeat(37))).toMatch(/demasiado larga/);
  });
});

describe('correo y errores de Supabase Auth', () => {
  it('normaliza el correo o devuelve null', () => {
    expect(normalizarCorreo(' Guido@GFK.com.ar ')).toBe('guido@gfk.com.ar');
    expect(normalizarCorreo('')).toBeNull();
    expect(normalizarCorreo(null)).toBeNull();
    expect(normalizarCorreo('dos @espacios.com')).toBeNull();
  });

  it('reconoce el error de correo duplicado', () => {
    expect(esCorreoDuplicado({ code: 'email_exists', message: 'x' })).toBe(true);
    expect(esCorreoDuplicado({ message: 'A user with this email address has already been registered' })).toBe(true);
    expect(esCorreoDuplicado({ message: 'Password should be at least 6 characters' })).toBe(false);
    expect(esCorreoDuplicado(null)).toBe(false);
  });

  it('muestra los roles con su nombre', () => {
    expect(textoRol('ADMINISTRADOR')).toBe('Administrador');
    expect(textoRol('OPERARIO')).toBe('Operario');
  });
});
