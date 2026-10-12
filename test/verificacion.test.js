/**
 * Tests unitarios de verificación por email (PBI-7, capa logica).
 * Sin HTTP ni SMTP: tokens únicos, un solo uso y activación real.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");

describe("PBI-7: tokens de verificación en logica", () => {
  let logica;

  beforeEach(() => {
    logica = new Logica(new Datos(), { costeHash: 4 });
    logica.registrar("ana@ejemplo.com", "secreta123");
  });

  it("solicitar genera un token único ligado al email pendiente", () => {
    const uno = logica.solicitarVerificacion("ana@ejemplo.com");
    const dos = logica.solicitarVerificacion("ana@ejemplo.com");
    assert.equal(uno.email, "ana@ejemplo.com");
    assert.ok(uno.token && uno.token.length >= 32);
    assert.notEqual(uno.token, dos.token);
    assert.equal(logica.isActive("ana@ejemplo.com"), false);
  });

  it("verificar activa la cuenta y habilita el login", () => {
    const { token } = logica.solicitarVerificacion("ana@ejemplo.com");
    const usuario = logica.verificarCuenta(token);
    assert.equal(usuario.estado, "activo");
    const sesion = logica.login("ana@ejemplo.com", "secreta123");
    assert.ok(sesion.token);
  });

  it("el token es de un solo uso: reutilizarlo da error", () => {
    const { token } = logica.solicitarVerificacion("ana@ejemplo.com");
    logica.verificarCuenta(token);
    assert.throws(() => logica.verificarCuenta(token), /inválido o expirado/);
  });

  it("token falso o ausente da error sin distinguir", () => {
    assert.throws(() => logica.verificarCuenta("token-falso"), /inválido o expirado/);
    assert.throws(() => logica.verificarCuenta(undefined), /inválido o expirado/);
  });

  it("no se genera enlace para cuentas activas ni inexistentes", () => {
    const { token } = logica.solicitarVerificacion("ana@ejemplo.com");
    logica.verificarCuenta(token);
    assert.throws(() => logica.solicitarVerificacion("ana@ejemplo.com"), /ya está activa/);
    assert.throws(() => logica.solicitarVerificacion("nadie@ejemplo.com"), /no encontrado/);
  });

  it("el enlace de un usuario eliminado ya no activa a nadie", () => {
    const { token } = logica.solicitarVerificacion("ana@ejemplo.com");
    logica.eliminar("ana@ejemplo.com");
    assert.throws(() => logica.verificarCuenta(token), /no encontrado/);
  });
});
