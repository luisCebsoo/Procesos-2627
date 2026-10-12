/**
 * Tests de persistencia MongoDB (PBI-5) con stubs: NINGÚN test
 * toca una base de datos real. El stub imita la forma mínima del
 * driver (collection().find/replaceOne/deleteOne) y registra llamadas.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");

function crearMongoFalso(docs = {}) {
  const llamadas = [];
  const tabla = { usuarios: [], eliminados: [], sesiones: [], ...docs };
  return {
    llamadas,
    collection(nombre) {
      return {
        find: () => ({ toArray: async () => (tabla[nombre] || []).map((d) => ({ ...d })) }),
        replaceOne: async (filtro, doc, opts) => {
          llamadas.push({ op: "replaceOne", col: nombre, filtro, doc, opts });
          return { acknowledged: true };
        },
        deleteOne: async (filtro) => {
          llamadas.push({ op: "deleteOne", col: nombre, filtro });
          return { deletedCount: 1 };
        },
      };
    },
  };
}

const vaciar = () => new Promise((r) => setImmediate(r)); // deja terminar los persistir()

describe("PBI-5: persistencia MongoDB con stubs", () => {
  it("conectarDB sin URI no toca red y queda en modo memoria", async () => {
    const datos = new Datos();
    assert.equal(await datos.conectarDB(undefined), false);
    assert.equal(await datos.conectarDB(""), false);
    assert.equal(datos.db, null);
    datos.guardarUsuario({ email: "a@b.com", rol: "usuario", estado: "pendiente" });
    assert.equal(datos.buscarPorEmail("a@b.com").email, "a@b.com");
  });

  it("cargar() hidrata la caché desde las 3 colecciones (sin _id)", async () => {
    const datos = new Datos();
    datos.usarBD(
      crearMongoFalso({
        usuarios: [{ _id: "x1", email: "ana@ejemplo.com", rol: "usuario", estado: "activo" }],
        eliminados: [{ _id: "x2", email: "tumba@ejemplo.com" }],
        sesiones: [{ _id: "x3", token: "tok-1", email: "ana@ejemplo.com" }],
      })
    );
    await datos.cargar();
    assert.equal(datos.buscarPorEmail("ana@ejemplo.com").estado, "activo");
    assert.ok(!("_id" in datos.buscarPorEmail("ana@ejemplo.com")));
    assert.equal(datos.fueEliminado("tumba@ejemplo.com"), true);
    assert.equal(datos.buscarSesion("tok-1"), "ana@ejemplo.com");
  });

  it("guardarUsuario hace upsert en Mongo con filtro por email", async () => {
    const mongo = crearMongoFalso();
    const datos = new Datos();
    datos.usarBD(mongo);
    datos.guardarUsuario({ email: "a@b.com", rol: "usuario", estado: "pendiente" });
    await vaciar();
    assert.deepEqual(mongo.llamadas, [
      { op: "replaceOne", col: "usuarios", filtro: { email: "a@b.com" }, doc: { email: "a@b.com", rol: "usuario", estado: "pendiente" }, opts: { upsert: true } },
    ]);
  });

  it("eliminar + tumba + sesiones generan deleteOne/replaceOne correctos", async () => {
    const mongo = crearMongoFalso();
    const datos = new Datos();
    datos.usarBD(mongo);
    datos.guardarUsuario({ email: "a@b.com", rol: "usuario", estado: "pendiente" });
    datos.eliminarUsuario("a@b.com");
    datos.marcarEliminado("a@b.com");
    datos.guardarSesion("tok-9", "a@b.com");
    datos.eliminarSesion("tok-9");
    await vaciar();
    const ops = mongo.llamadas.map((l) => l.op + ":" + l.col);
    assert.deepEqual(ops, [
      "replaceOne:usuarios",
      "deleteOne:usuarios",
      "replaceOne:eliminados",
      "replaceOne:sesiones",
      "deleteOne:sesiones",
    ]);
  });

  it("sin BD las escrituras son no-op: la interfaz sincrona no lanza", async () => {
    const datos = new Datos(); // sin usarBD
    datos.guardarUsuario({ email: "a@b.com" });
    datos.eliminarUsuario("a@b.com");
    datos.marcarEliminado("a@b.com");
    datos.guardarSesion("t", "a@b.com");
    datos.eliminarSesion("t");
    await vaciar(); // no hay promesas que fallen
    assert.equal(datos.db, null);
  });

  it("logica funciona idéntica sobre el stub: la interfaz no cambió", async () => {
    const mongo = crearMongoFalso({
      usuarios: [{ _id: "x", email: "vieja@ejemplo.com", hash: "h", rol: "usuario", estado: "activo" }],
    });
    const datos = new Datos();
    datos.usarBD(mongo);
    await datos.cargar();
    const logica = new Logica(datos, { costeHash: 4 });
    // Registrar + activar + estado: solo usa la interfaz de siempre
    const creado = logica.registrar("nueva@ejemplo.com", "secreta123");
    assert.equal(creado.estado, "pendiente");
    logica.activar("nueva@ejemplo.com");
    assert.equal(logica.isActive("nueva@ejemplo.com"), true);
    assert.equal(logica.listar().length, 2);
    await vaciar();
    assert.ok(mongo.llamadas.some((l) => l.op === "replaceOne" && l.col === "usuarios"));
  });
});
