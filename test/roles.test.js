/**
 * Tests unitarios de roles y administración (PBI-6, capa logica).
 * Sin HTTP: permisos por solicitante y seed del primer admin.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");

describe("PBI-6: roles y permisos en logica", () => {
  let logica;

  beforeEach(() => {
    logica = new Logica(new Datos(), { costeHash: 4 });
  });

  function admin() {
    return logica.inicializarAdmin("jefa@ejemplo.com", "secreta123");
  }

  function usuario(email = "ana@ejemplo.com") {
    logica.registrar(email, "secreta123");
    logica.activar(email);
    return email;
  }

  it("inicializarAdmin crea admin activo con hash (vista sin secretos)", () => {
    const creado = admin();
    assert.deepEqual(creado, { email: "jefa@ejemplo.com", nombre: null, rol: "admin", estado: "activo" });
    assert.equal(logica.esAdmin("jefa@ejemplo.com"), true);
    const sesion = logica.login("jefa@ejemplo.com", "secreta123");
    assert.equal(sesion.usuario.rol, "admin");
  });

  it("inicializarAdmin asciende a un usuario existente sin romper su clave", () => {
    usuario();
    const ascendido = logica.inicializarAdmin("ANA@ejemplo.com");
    assert.equal(ascendido.rol, "admin");
    assert.equal(ascendido.estado, "activo");
    assert.equal(logica.login("ana@ejemplo.com", "secreta123").usuario.rol, "admin");
  });

  it("el seed valida: email malo, tumba y sin clave para nuevos fallan", () => {
    assert.throws(() => logica.inicializarAdmin("mal"), /inválido/);
    assert.throws(() => logica.inicializarAdmin("nuevo@ejemplo.com", "corta"), /contraseña/);
    usuario("tumba@ejemplo.com");
    logica.eliminar("tumba@ejemplo.com");
    assert.throws(() => logica.inicializarAdmin("tumba@ejemplo.com", "secreta123"), /eliminada/);
  });

  it("listarComo y consultarActivoComo: solo admin; resto PROHIBIDO", () => {
    admin();
    usuario();
    assert.equal(logica.listarComo("jefa@ejemplo.com").length, 2);
    assert.equal(logica.consultarActivoComo("jefa@ejemplo.com", "ana@ejemplo.com"), true);
    assert.throws(() => logica.listarComo("ana@ejemplo.com"), /administrador/);
    assert.throws(() => logica.consultarActivoComo("ana@ejemplo.com", "ana@ejemplo.com"), /administrador/);
    assert.throws(() => logica.listarComo("nadie@ejemplo.com"), /administrador/);
  });

  it("eliminarComo: admin borra a cualquiera; usuario solo a sí mismo", () => {
    admin();
    usuario("ana@ejemplo.com");
    usuario("bob@ejemplo.com");
    assert.deepEqual(logica.eliminarComo("jefa@ejemplo.com", "ana@ejemplo.com").eliminado, true);
    assert.deepEqual(logica.eliminarComo("bob@ejemplo.com", "bob@ejemplo.com").eliminado, true);
    usuario("carla@ejemplo.com");
    assert.throws(() => logica.eliminarComo("carla@ejemplo.com", "jefa@ejemplo.com"), /administrador/);
    assert.throws(() => logica.eliminarComo("nadie@ejemplo.com", "carla@ejemplo.com"), /administrador/);
  });

  it("esAdmin exige rol admin Y estado activo", () => {
    usuario();
    assert.equal(logica.esAdmin("ana@ejemplo.com"), false);
    logica.inicializarAdmin("ana@ejemplo.com");
    assert.equal(logica.esAdmin("ana@ejemplo.com"), true);
    assert.equal(logica.esAdmin("nadie@ejemplo.com"), false);
  });
});
