/**
 * Tests de la capa API (PBI-2): los endpoints delegan en logica
 * y traducen err.code a HTTP. Transporte, no reglas.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

async function arrancar() {
  const app = createApp(new Logica(new Datos()));
  const server = app.listen(0);
  await new Promise((r) => server.on("listening", r));
  return { server, base: `http://127.0.0.1:${server.address().port}` };
}

async function llamar(base, metodo, ruta, cuerpo) {
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: { "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: res.status, cuerpo: await res.json() };
}

describe("PBI-2: endpoints /api/users", () => {
  it("POST crea (201) y GET lista (200) solo con email/rol/estado", async () => {
    const { server, base } = await arrancar();
    try {
      const creado = await llamar(base, "POST", "/api/users", { email: "ana@ejemplo.com", nombre: "Ana" });
      assert.equal(creado.estado, 201);
      assert.equal(creado.cuerpo.estado, "pendiente");
      const lista = await llamar(base, "GET", "/api/users");
      assert.equal(lista.estado, 200);
      assert.deepEqual(lista.cuerpo, [{ email: "ana@ejemplo.com", rol: "usuario", estado: "pendiente" }]);
    } finally {
      server.close();
    }
  });

  it("POST duplicado -> 409 y POST invalido -> 400", async () => {
    const { server, base } = await arrancar();
    try {
      assert.equal((await llamar(base, "POST", "/api/users", { email: "a@b.com" })).estado, 201);
      assert.equal((await llamar(base, "POST", "/api/users", { email: "a@b.com" })).estado, 409);
      assert.equal((await llamar(base, "POST", "/api/users", { email: "mal" })).estado, 400);
      assert.equal((await llamar(base, "POST", "/api/users", {})).estado, 400);
    } finally {
      server.close();
    }
  });

  it("GET /:email/active refleja pendiente->false y 404 si no existe", async () => {
    const { server, base } = await arrancar();
    try {
      await llamar(base, "POST", "/api/users", { email: "a@b.com" });
      const r = await llamar(base, "GET", "/api/users/a@b.com/active");
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo, { email: "a@b.com", active: false });
      assert.equal((await llamar(base, "GET", "/api/users/nadie@x.com/active")).estado, 404);
    } finally {
      server.close();
    }
  });

  it("DELETE borra (200) e inexistente da 404", async () => {
    const { server, base } = await arrancar();
    try {
      await llamar(base, "POST", "/api/users", { email: "a@b.com" });
      const borrado = await llamar(base, "DELETE", "/api/users/a@b.com");
      assert.equal(borrado.estado, 200);
      assert.deepEqual(borrado.cuerpo, { email: "a@b.com", eliminado: true });
      assert.deepEqual((await llamar(base, "GET", "/api/users")).cuerpo, []);
      assert.equal((await llamar(base, "DELETE", "/api/users/a@b.com")).estado, 404);
    } finally {
      server.close();
    }
  });

  it("tras borrar, el alta del mismo email se rechaza (403, no vuelve a entrar)", async () => {
    const { server, base } = await arrancar();
    try {
      await llamar(base, "POST", "/api/users", { email: "a@b.com" });
      await llamar(base, "DELETE", "/api/users/a@b.com");
      assert.equal((await llamar(base, "POST", "/api/users", { email: "a@b.com" })).estado, 403);
    } finally {
      server.close();
    }
  });
});
