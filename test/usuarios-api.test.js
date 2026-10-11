/**
 * Tests de la capa API (PBI-2 + PBI-4): los endpoints delegan en logica
 * y traducen err.code a HTTP. Transporte, no reglas.
 * Desde PBI-4: GET/DELETE de /api/users exigen Bearer (401 sin token).
 * POST /api/users (alta clásica sin credencial) sigue público.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

async function arrancar() {
  const datos = new Datos();
  const logica = new Logica(datos, { costeHash: 4 });
  const app = createApp(logica);
  const server = app.listen(0);
  await new Promise((r) => server.on("listening", r));
  return { server, logica, base: `http://127.0.0.1:${server.address().port}` };
}

async function llamar(base, metodo, ruta, cuerpo, token) {
  const cabeceras = { "Content-Type": "application/json" };
  if (token) {
    cabeceras.Authorization = "Bearer " + token;
  }
  const res = await fetch(base + ruta, {
    method: metodo,
    headers: cabeceras,
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  return { estado: res.status, cuerpo: await res.json() };
}

// Da de alta con credencial, activa y entra: devuelve token válido.
async function entrar(base, logica, email) {
  const reg = await llamar(base, "POST", "/api/auth/registro", { email, password: "secreta123" });
  assert.equal(reg.estado, 201);
  logica.activar(email);
  const login = await llamar(base, "POST", "/api/auth/login", { email, password: "secreta123" });
  assert.equal(login.estado, 200);
  return login.cuerpo.token;
}

describe("PBI-2: endpoints /api/users", () => {
  it("POST crea (201) y GET con token lista (200) solo con email/rol/estado", async () => {
    const { server, logica, base } = await arrancar();
    try {
      const creado = await llamar(base, "POST", "/api/users", { email: "ana@ejemplo.com", nombre: "Ana" });
      assert.equal(creado.estado, 201);
      assert.equal(creado.cuerpo.estado, "pendiente");
      const token = await entrar(base, logica, "admin@ejemplo.com");
      const lista = await llamar(base, "GET", "/api/users", undefined, token);
      assert.equal(lista.estado, 200);
      assert.deepEqual(lista.cuerpo, [
        { email: "ana@ejemplo.com", rol: "usuario", estado: "pendiente" },
        { email: "admin@ejemplo.com", rol: "usuario", estado: "activo" },
      ]);
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

  it("GET /:email/active con token refleja pendiente->false y 404 si no existe", async () => {
    const { server, logica, base } = await arrancar();
    try {
      await llamar(base, "POST", "/api/users", { email: "a@b.com" });
      const token = await entrar(base, logica, "admin@ejemplo.com");
      const r = await llamar(base, "GET", "/api/users/a@b.com/active", undefined, token);
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo, { email: "a@b.com", active: false });
      assert.equal((await llamar(base, "GET", "/api/users/nadie@x.com/active", undefined, token)).estado, 404);
    } finally {
      server.close();
    }
  });

  it("DELETE con token borra (200) e inexistente da 404", async () => {
    const { server, logica, base } = await arrancar();
    try {
      await llamar(base, "POST", "/api/users", { email: "a@b.com" });
      const token = await entrar(base, logica, "admin@ejemplo.com");
      const borrado = await llamar(base, "DELETE", "/api/users/a@b.com", undefined, token);
      assert.equal(borrado.estado, 200);
      assert.deepEqual(borrado.cuerpo, { email: "a@b.com", eliminado: true });
      assert.deepEqual((await llamar(base, "GET", "/api/users", undefined, token)).cuerpo, [
        { email: "admin@ejemplo.com", rol: "usuario", estado: "activo" },
      ]);
      assert.equal((await llamar(base, "DELETE", "/api/users/a@b.com", undefined, token)).estado, 404);
    } finally {
      server.close();
    }
  });

  it("tras borrar, el alta del mismo email se rechaza (403, no vuelve a entrar)", async () => {
    const { server, logica, base } = await arrancar();
    try {
      await llamar(base, "POST", "/api/users", { email: "a@b.com" });
      const token = await entrar(base, logica, "admin@ejemplo.com");
      await llamar(base, "DELETE", "/api/users/a@b.com", undefined, token);
      assert.equal((await llamar(base, "POST", "/api/users", { email: "a@b.com" })).estado, 403);
    } finally {
      server.close();
    }
  });

  it("PBI-4: sin token o con token falso las rutas protegidas devuelven 401", async () => {
    const { server, base } = await arrancar();
    try {
      assert.equal((await llamar(base, "GET", "/api/users")).estado, 401);
      assert.equal((await llamar(base, "GET", "/api/users/a@b.com/active")).estado, 401);
      assert.equal((await llamar(base, "DELETE", "/api/users/a@b.com")).estado, 401);
      assert.equal((await llamar(base, "GET", "/api/users", undefined, "token-falso")).estado, 401);
      assert.equal((await llamar(base, "GET", "/api/auth/me")).estado, 401);
    } finally {
      server.close();
    }
  });
});
