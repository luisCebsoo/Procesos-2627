/**
 * Tests de la capa API (PBI-7): el registro dispara el envío (stub de
 * correo, cero SMTP real) y el enlace activa la cuenta con un GET.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

function crearCorreoFalso() {
  const enviados = [];
  return {
    enviados,
    enviarEnlace: async (destino, enlace) => {
      enviados.push({ destino, enlace });
      return { simulado: true, destino, enlace };
    },
  };
}

async function arrancar(correo) {
  const datos = new Datos();
  const app = createApp(new Logica(datos, { costeHash: 4 }), { correo, baseUrl: "http://test.local" });
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

const tokenDe = (enlace) => new URL(enlace).searchParams.get("token");

describe("PBI-7: registro -> email -> activación por enlace", () => {
  it("registrarse envía 1 email con enlace único y sin tumbar el 201", async () => {
    const correo = crearCorreoFalso();
    const { server, base } = await arrancar(correo);
    try {
      const r = await llamar(base, "POST", "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" });
      assert.equal(r.estado, 201);
      assert.equal(r.cuerpo.estado, "pendiente");
      assert.equal(correo.enviados.length, 1);
      assert.equal(correo.enviados[0].destino, "ana@ejemplo.com");
      assert.ok(correo.enviados[0].enlace.startsWith("http://test.local/verificar.html?token="));
      assert.ok(tokenDe(correo.enviados[0].enlace));
    } finally {
      server.close();
    }
  });

  it("abrir el enlace activa y habilita el login; reutilizarlo da 404", async () => {
    const correo = crearCorreoFalso();
    const { server, base } = await arrancar(correo);
    try {
      await llamar(base, "POST", "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" });
      assert.equal((await llamar(base, "POST", "/api/auth/login", { email: "ana@ejemplo.com", password: "secreta123" })).estado, 403);
      const token = tokenDe(correo.enviados[0].enlace);
      const v = await llamar(base, "GET", "/api/auth/verificar/" + token);
      assert.equal(v.estado, 200);
      assert.equal(v.cuerpo.estado, "activo");
      assert.equal((await llamar(base, "POST", "/api/auth/login", { email: "ana@ejemplo.com", password: "secreta123" })).estado, 200);
      assert.equal((await llamar(base, "GET", "/api/auth/verificar/" + token)).estado, 404);
      assert.equal((await llamar(base, "GET", "/api/auth/verificar/token-falso")).estado, 404);
    } finally {
      server.close();
    }
  });

  it("reenviar genera un enlace nuevo para pendientes (y falla si ya activa)", async () => {
    const correo = crearCorreoFalso();
    const { server, base } = await arrancar(correo);
    try {
      await llamar(base, "POST", "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" });
      const r = await llamar(base, "POST", "/api/auth/reenviar", { email: "ana@ejemplo.com" });
      assert.equal(r.estado, 200);
      assert.equal(correo.enviados.length, 2);
      assert.notEqual(tokenDe(correo.enviados[0].enlace), tokenDe(correo.enviados[1].enlace));
      await llamar(base, "GET", "/api/auth/verificar/" + tokenDe(correo.enviados[1].enlace));
      assert.equal((await llamar(base, "POST", "/api/auth/reenviar", { email: "ana@ejemplo.com" })).estado, 400);
    } finally {
      server.close();
    }
  });

  it("si el correo falla, el registro sigue devolviendo 201 (fail-open con log)", async () => {
    const roto = { enviarEnlace: async () => { throw new Error("SMTP caído"); } };
    const { server, base } = await arrancar(roto);
    try {
      const r = await llamar(base, "POST", "/api/auth/registro", { email: "ana@ejemplo.com", password: "secreta123" });
      assert.equal(r.estado, 201);
    } finally {
      server.close();
    }
  });
});
