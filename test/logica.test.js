/**
 * Tests unitarios de logica.js (PBI-2).
 * Felices + error. Sin HTTP: solo reglas de negocio.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");

describe("PBI-2: logica de usuarios", () => {
  let logica;

  beforeEach(() => {
    logica = new Logica(new Datos());
  });

  it("alta crea cuenta pendiente con rol usuario y normaliza el email", () => {
    const u = logica.alta("  Ana@Ejemplo.COM ", { nombre: "  Ana  " });
    assert.deepEqual(u, { email: "ana@ejemplo.com", nombre: "Ana", rol: "usuario", estado: "pendiente" });
  });

  it("alta sin nombre lo deja a null y sigue siendo valida", () => {
    const u = logica.alta("a@b.com");
    assert.equal(u.nombre, null);
    assert.equal(u.estado, "pendiente");
  });

  it("alta con email invalido o ausente falla con VALIDACION", () => {
    for (const malo of ["sin-arroba", "a@b", "@b.com", "   ", null, undefined]) {
      assert.throws(() => logica.alta(malo), /inválido/, `deberia fallar: ${malo}`);
    }
  });

  it("alta duplicada (incluso con mayusculas) falla con DUPLICADO", () => {
    logica.alta("ana@ejemplo.com");
    assert.throws(() => logica.alta("ANA@ejemplo.com"), /ya registrado/);
  });

  it("listar solo expone email, rol y estado", () => {
    logica.alta("ana@ejemplo.com", { nombre: "Ana" });
    logica.alta("bob@ejemplo.com");
    assert.deepEqual(logica.listar(), [
      { email: "ana@ejemplo.com", rol: "usuario", estado: "pendiente" },
      { email: "bob@ejemplo.com", rol: "usuario", estado: "pendiente" },
    ]);
  });

  it("isActive: pendiente es false, tras activar es true, desconocido es error", () => {
    logica.alta("ana@ejemplo.com");
    assert.equal(logica.isActive("ana@ejemplo.com"), false);
    logica.activar("ana@ejemplo.com");
    assert.equal(logica.isActive("ana@ejemplo.com"), true);
    assert.throws(() => logica.isActive("nadie@ejemplo.com"), /no encontrado/);
  });

  it("eliminar borra y deja tumba: no aparece, no se reactiva, no se da de alta", () => {
    logica.alta("ana@ejemplo.com");
    assert.deepEqual(logica.eliminar("ana@ejemplo.com"), { email: "ana@ejemplo.com", eliminado: true });
    assert.deepEqual(logica.listar(), []);
    assert.throws(() => logica.isActive("ana@ejemplo.com"), /no encontrado/);
    assert.throws(() => logica.alta("ana@ejemplo.com"), /eliminada/);
  });

  it("eliminar o activar un usuario inexistente falla con NO_ENCONTRADO", () => {
    assert.throws(() => logica.eliminar("nadie@ejemplo.com"), /no encontrado/);
    assert.throws(() => logica.activar("nadie@ejemplo.com"), /no encontrado/);
  });
});
