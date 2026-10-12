/**
 * Tests de la capa API (PBI-6): el control de rol se aplica en el
 * servidor (middleware + logica). Ocultar botones no bastaría.
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

async function entrar(base, logica, email, comoAdmin = false) {
  const reg = await llamar(base, "POST", "/api/auth/registro", { email, password: "secreta123" });
  assert.equal(reg.estado, 201);
  if (comoAdmin) {
    logica.inicializarAdmin(email);
  } else {
    logica.activar(email);
  }
  const login = await llamar(base, "POST", "/api/auth/login", { email, password: "secreta123" });
  assert.equal(login.estado, 200);
  return login.cuerpo.token;
}

describe("PBI-6: control de rol en endpoints", () => {
  it("GET /users: admin 200 con la lista; usuario 403; sin token 401", async () => {
    const { server, logica, base } = await arrancar();
    try {
      const tAdmin = await entrar(base, logica, "jefa@ejemplo.com", true);
      const tUser = await entrar(base, logica, "ana@ejemplo.com");
      const ok = await llamar(base, "GET", "/api/users", undefined, tAdmin);
      assert.equal(ok.estado, 200);
      assert.equal(ok.cuerpo.length, 2);
      assert.equal((await llamar(base, "GET", "/api/users", undefined, tUser)).estado, 403);
      assert.equal((await llamar(base, "GET", "/api/users")).estado, 401);
    } finally {
      server.close();
    }
  });

  it("GET /:email/active: admin 200; usuario 403 aunque pregunte por sí mismo", async () => {
    const { server, logica, base } = await arrancar();
    try {
      const tAdmin = await entrar(base, logica, "jefa@ejemplo.com", true);
      const tUser = await entrar(base, logica, "ana@ejemplo.com");
      const ok = await llamar(base, "GET", "/api/users/ana@ejemplo.com/active", undefined, tAdmin);
      assert.equal(ok.estado, 200);
      assert.deepEqual(ok.cuerpo, { email: "ana@ejemplo.com", active: true });
      assert.equal((await llamar(base, "GET", "/api/users/ana@ejemplo.com/active", undefined, tUser)).estado, 403);
    } finally {
      server.close();
    }
  });

  it("DELETE: admin borra a otro (200); usuario se borra a sí mismo (200) pero no a otro (403)", async () => {
    const { server, logica, base } = await arrancar();
    try {
      const tAdmin = await entrar(base, logica, "jefa@ejemplo.com", true);
      const tAna = await entrar(base, logica, "ana@ejemplo.com");
      const tBob = await entrar(base, logica, "bob@ejemplo.com");
      assert.equal((await llamar(base, "DELETE", "/api/users/bob@ejemplo.com", undefined, tAna)).estado, 403);
      assert.equal((await llamar(base, "DELETE", "/api/users/ana@ejemplo.com", undefined, tAna)).estado, 200);
      assert.equal((await llamar(base, "DELETE", "/api/users/bob@ejemplo.com", undefined, tAdmin)).estado, 200);
    } finally {
      server.close();
    }
  });
});
