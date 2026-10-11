/**
 * Tests del ciclo de vida de la sesión (PBI-4).
 * Persistencia (revalidación tipo F5), logout y 401 en rutas protegidas.
 */
const { describe, it, beforeEach } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

function nuevaLogica() {
  return new Logica(new Datos(), { costeHash: 4 });
}

function registradaYActiva(logica, email) {
  logica.registrar(email, "secreta123");
  logica.activar(email);
}

describe("PBI-4: sesión en logica", () => {
  let logica;

  beforeEach(() => {
    logica = nuevaLogica();
  });

  it("obtenerSesion devuelve el perfil si el token es válido", () => {
    registradaYActiva(logica, "ana@ejemplo.com");
    const { token } = logica.login("ana@ejemplo.com", "secreta123");
    assert.deepEqual(logica.obtenerSesion(token), {
      token,
      usuario: { email: "ana@ejemplo.com", nombre: null, rol: "usuario", estado: "activo" },
    });
  });

  it("token ausente o falso se rechaza sin distinguir (CREDENCIALES)", () => {
    assert.throws(() => logica.obtenerSesion(undefined), /sesión inválida/);
    assert.throws(() => logica.obtenerSesion("token-falso"), /sesión inválida/);
  });

  it("logout invalida el token: después ya no revalida", () => {
    registradaYActiva(logica, "ana@ejemplo.com");
    const { token } = logica.login("ana@ejemplo.com", "secreta123");
    assert.deepEqual(logica.logout(token), { ok: true });
    assert.throws(() => logica.obtenerSesion(token), /sesión inválida/);
    assert.deepEqual(logica.logout(undefined), { ok: true }); // idempotente
  });

  it("la sesión de un usuario eliminado deja de valer (tumba)", () => {
    registradaYActiva(logica, "ana@ejemplo.com");
    const { token } = logica.login("ana@ejemplo.com", "secreta123");
    logica.eliminar("ana@ejemplo.com");
    assert.throws(() => logica.obtenerSesion(token), /eliminada/);
  });
});

describe("PBI-4: ciclo HTTP login -> F5 (/me) -> logout -> 401", () => {
  async function arrancar() {
    const datos = new Datos();
    const app = createApp(new Logica(datos, { costeHash: 4 }));
    const server = app.listen(0);
    await new Promise((r) => server.on("listening", r));
    return { server, datos, base: `http://127.0.0.1:${server.address().port}` };
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

  it("login -> /me 200 (F5) -> /logout 200 -> /me 401 y /users 401", async () => {
    const { server, datos, base } = await arrancar();
    try {
      assert.equal((await llamar(base, "POST", "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" })).estado, 201);
      new Logica(datos, { costeHash: 4 }).activar("ana@ejemplo.com");
      const login = await llamar(base, "POST", "/api/auth/login", { email: "ana@ejemplo.com", password: "secreta123" });
      const token = login.cuerpo.token;

      // F5: petición nueva con el token guardado -> el servidor revalida
      const me = await llamar(base, "GET", "/api/auth/me", undefined, token);
      assert.equal(me.estado, 200);
      assert.equal(me.cuerpo.email, "ana@ejemplo.com");

      // Logout: el token muere en cliente y servidor
      assert.deepEqual((await llamar(base, "POST", "/api/auth/logout", undefined, token)).cuerpo, { ok: true });
      assert.equal((await llamar(base, "GET", "/api/auth/me", undefined, token)).estado, 401);
      assert.equal((await llamar(base, "GET", "/api/users", undefined, token)).estado, 401);
    } finally {
      server.close();
    }
  });

  it("logout sin token se rechaza con 401 (ruta también protegida)", async () => {
    const { server, base } = await arrancar();
    try {
      assert.equal((await llamar(base, "POST", "/api/auth/logout")).estado, 401);
    } finally {
      server.close();
    }
  });
});
