/**
 * Tests de la capa API (PBI-3): /api/auth/* delega en logica.
 * El hash jamás viaja en ninguna respuesta.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

async function arrancar() {
  const datos = new Datos();
  const app = createApp(new Logica(datos, { costeHash: 4 }));
  const server = app.listen(0);
  await new Promise((r) => server.on("listening", r));
  return { server, datos, base: `http://127.0.0.1:${server.address().port}` };
}

async function llamar(base, ruta, cuerpo) {
  const res = await fetch(base + ruta, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(cuerpo),
  });
  return { estado: res.status, cuerpo: await res.json() };
}

describe("PBI-3: endpoints /api/auth/*", () => {
  it("registro 201 pendiente sin hash ni token; duplicado 409; corta 400", async () => {
    const { server, base } = await arrancar();
    try {
      const r = await llamar(base, "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" });
      assert.equal(r.estado, 201);
      assert.deepEqual(r.cuerpo, { email: "ana@ejemplo.com", nombre: null, rol: "usuario", estado: "pendiente" });
      assert.equal((await llamar(base, "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" })).estado, 409);
      assert.equal((await llamar(base, "/api/auth/registro", { email: "a@b.com", password: "corta" })).estado, 400);
    } finally {
      server.close();
    }
  });

  it("login pendiente -> 403; tras activar -> 200 con token", async () => {
    const { server, datos, base } = await arrancar();
    try {
      await llamar(base, "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" });
      assert.equal((await llamar(base, "/api/auth/login", { email: "ana@ejemplo.com", password: "secreta123" })).estado, 403);
      new Logica(datos, { costeHash: 4 }).activar("ana@ejemplo.com");
      const ok = await llamar(base, "/api/auth/login", { email: "ana@ejemplo.com", password: "secreta123" });
      assert.equal(ok.estado, 200);
      assert.ok(ok.cuerpo.token);
      assert.equal(ok.cuerpo.usuario.estado, "activo");
      assert.equal(ok.cuerpo.usuario.hash, undefined);
    } finally {
      server.close();
    }
  });

  it("login con password mal o usuario fantasma -> 401 idéntico", async () => {
    const { server, datos, base } = await arrancar();
    try {
      await llamar(base, "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" });
      new Logica(datos, { costeHash: 4 }).activar("ana@ejemplo.com");
      const mal = await llamar(base, "/api/auth/login", { email: "ana@ejemplo.com", password: "otraclave9" });
      const fantasma = await llamar(base, "/api/auth/login", { email: "nadie@x.com", password: "otraclave9" });
      assert.equal(mal.estado, 401);
      assert.deepEqual(fantasma, mal);
    } finally {
      server.close();
    }
  });
});
