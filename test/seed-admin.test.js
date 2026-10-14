/**
 * Tests del seed de admin (entrega/defensa). En memoria, sin red.
 * El script reutiliza la lógica real: crear o actualizar + login.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { asegurarAdmin } = require("../servidor/seed-admin");

function entorno() {
  const datos = new Datos();
  const logica = new Logica(datos, { costeHash: 4 });
  return { datos, logica };
}

describe("seed de admin", () => {
  it("crea desde cero admin activo y el login devuelve rol admin", async () => {
    const { datos, logica } = entorno();
    const r = await asegurarAdmin({ datos, logica, email: "admin@procesos.com", password: "Admin1234!" });
    assert.deepEqual([r.accion, r.rol, r.estado], ["creado", "admin", "activo"]);
    const guardado = datos.buscarPorEmail("admin@procesos.com");
    assert.ok(guardado.hash && !guardado.hash.includes("Admin1234!"));
    const sesion = logica.login("admin@procesos.com", "Admin1234!");
    assert.equal(sesion.usuario.rol, "admin");
  });

  it("es idempotente: segunda pasada no duplica y el login sigue bien", async () => {
    const { datos, logica } = entorno();
    await asegurarAdmin({ datos, logica, email: "admin@procesos.com", password: "Admin1234!" });
    const r = await asegurarAdmin({ datos, logica, email: "admin@procesos.com", password: "Admin1234!" });
    assert.equal(r.accion, "actualizado");
    assert.equal(logica.listar().length, 1);
    assert.equal(logica.login("admin@procesos.com", "Admin1234!").usuario.rol, "admin");
  });

  it("asciende a un usuario normal y le fija la contraseña", async () => {
    const { datos, logica } = entorno();
    logica.registrar("admin@procesos.com", "otraclave123");
    logica.activar("admin@procesos.com");
    const r = await asegurarAdmin({ datos, logica, email: "admin@procesos.com", password: "Admin1234!" });
    assert.deepEqual([r.accion, r.clave], ["actualizado", "restablecida"]);
    const sesion = logica.login("admin@procesos.com", "Admin1234!");
    assert.deepEqual([sesion.usuario.rol, sesion.usuario.estado], ["admin", "activo"]);
  });
});
