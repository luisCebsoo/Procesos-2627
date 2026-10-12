/**
 * Tests unitarios de login externo (PBI-8, capa logica).
 * Sin HTTP ni GitHub: el proveedor ya verificó el email.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");

describe("PBI-8: login externo en logica", () => {
  let logica;

  beforeEach(() => {
    logica = new Logica(new Datos(), { costeHash: 4 });
  });

  it("un usuario nuevo de OAuth nace activo con sesión válida", () => {
    const sesion = logica.loginExterno("octo@ejemplo.com", "Octo", "github");
    assert.ok(sesion.token);
    assert.deepEqual(sesion.usuario, { email: "octo@ejemplo.com", nombre: "Octo", rol: "usuario", estado: "activo" });
    assert.equal(logica.isActive("octo@ejemplo.com"), true);
  });

  it("volver a entrar no duplica y renueva la sesión", () => {
    const primera = logica.loginExterno("octo@ejemplo.com", "Octo", "github");
    const segunda = logica.loginExterno("octo@ejemplo.com", "Octo", "github");
    assert.equal(logica.listar().length, 1);
    assert.notEqual(primera.token, segunda.token);
    assert.deepEqual(logica.obtenerSesion(segunda.token).usuario.email, "octo@ejemplo.com");
  });

  it("un pendiente local asciende a activo al entrar con OAuth", () => {
    logica.registrar("ana@ejemplo.com", "secreta123");
    assert.equal(logica.isActive("ana@ejemplo.com"), false);
    const sesion = logica.loginExterno("ANA@ejemplo.com", "Ana", "github");
    assert.equal(sesion.usuario.estado, "activo");
    assert.equal(logica.isActive("ana@ejemplo.com"), true);
  });

  it("un eliminado no entra por OAuth ni se reactiva", () => {
    logica.registrar("mala@ejemplo.com", "secreta123");
    logica.activar("mala@ejemplo.com");
    logica.eliminar("mala@ejemplo.com");
    assert.throws(() => logica.loginExterno("mala@ejemplo.com", "Mala", "github"), /eliminada/);
  });

  it("email inválido del proveedor se rechaza", () => {
    assert.throws(() => logica.loginExterno("no-es-email", "X", "github"), /inválido/);
  });

  it("un admin conserva su rol al entrar con OAuth", () => {
    logica.inicializarAdmin("jefa@ejemplo.com", "secreta123");
    const sesion = logica.loginExterno("jefa@ejemplo.com", "Jefa", "github");
    assert.equal(sesion.usuario.rol, "admin");
  });
});
