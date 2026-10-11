/**
 * Tests unitarios de registro y login (PBI-3, capa logica).
 * Sin HTTP: reglas + seguridad (hash, pendiente, sesión).
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");

describe("PBI-3: registro y login locales", () => {
  let logica;

  beforeEach(() => {
    logica = new Logica(new Datos(), { costeHash: 4 }); // rápido en tests
  });

  it("registro crea pendiente y guarda hash, jamás la contraseña", () => {
    const creado = logica.registrar("ana@ejemplo.com", "secreta123", { nombre: "Ana" });
    assert.deepEqual(creado, { email: "ana@ejemplo.com", nombre: "Ana", rol: "usuario", estado: "pendiente" });
    const guardado = logica.datos.buscarPorEmail("ana@ejemplo.com");
    assert.ok(guardado.hash && !guardado.hash.includes("secreta123"));
    assert.equal(guardado.password, undefined);
  });

  it("registro exige contraseña mínima y no duplica", () => {
    assert.throws(() => logica.registrar("a@b.com", "corta"), /contraseña/);
    assert.throws(() => logica.registrar("a@b.com"), /contraseña/);
    logica.registrar("a@b.com", "secreta123");
    assert.throws(() => logica.registrar("A@B.COM", "otraclave123"), /ya registrado/);
  });

  it("recién registrado (pendiente) NO puede loguearse", () => {
    logica.registrar("ana@ejemplo.com", "secreta123");
    assert.throws(() => logica.login("ana@ejemplo.com", "secreta123"), /pendiente/);
  });

  it("tras activar, el login genera sesión con token y vista sin hash", () => {
    logica.registrar("ana@ejemplo.com", "secreta123");
    logica.activar("ana@ejemplo.com");
    const sesion = logica.login("ana@ejemplo.com", "secreta123");
    assert.ok(sesion.token && sesion.token.length >= 32);
    assert.deepEqual(sesion.usuario, { email: "ana@ejemplo.com", nombre: null, rol: "usuario", estado: "activo" });
    assert.equal(sesion.usuario.hash, undefined);
    assert.equal(logica.datos.buscarSesion(sesion.token), "ana@ejemplo.com");
  });

  it("password mal o usuario inexistente dan el mismo error (no enumera)", () => {
    logica.registrar("ana@ejemplo.com", "secreta123");
    logica.activar("ana@ejemplo.com");
    assert.throws(() => logica.login("ana@ejemplo.com", "otraclave9"), /inválidas/);
    assert.throws(() => logica.login("nadie@ejemplo.com", "otraclave9"), /inválidas/);
  });

  it("cuenta eliminada no vuelve a entrar ni a registrarse", () => {
    logica.registrar("ana@ejemplo.com", "secreta123");
    logica.activar("ana@ejemplo.com");
    logica.eliminar("ana@ejemplo.com");
    assert.throws(() => logica.login("ana@ejemplo.com", "secreta123"), /eliminada/);
    assert.throws(() => logica.registrar("ana@ejemplo.com", "nueva12345"), /eliminada/);
  });

  it("alta clásica (PBI-2, sin contraseña) tampoco puede loguearse", () => {
    logica.alta("viejo@ejemplo.com");
    logica.activar("viejo@ejemplo.com");
    assert.throws(() => logica.login("viejo@ejemplo.com", "loquesea1"), /inválidas/);
  });
});
