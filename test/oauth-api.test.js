/**
 * Tests de la capa API (PBI-8): inicio y callback OAuth con stub
 * (cero red a GitHub; fetch con redirect manual para ver los 302).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

function crearOAuthFalso() {
  return {
    configurado: true,
    urlAutorizacion: () => "https://github.com/login/oauth/authorize?client_id=falso",
    intercambiarCodigo: async (code) => {
      if (code !== "codigo-bueno") {
        throw new Error("código inválido o expirado");
      }
      return { email: "octo@ejemplo.com", nombre: "Octo" };
    },
  };
}

async function arrancar(oauth) {
  const datos = new Datos();
  const app = createApp(new Logica(datos, { costeHash: 4 }), { oauth, baseUrl: "http://test.local" });
  const server = app.listen(0);
  await new Promise((r) => server.on("listening", r));
  return { server, datos, base: `http://127.0.0.1:${server.address().port}` };
}

async function llamar(base, ruta) {
  const res = await fetch(base + ruta, { redirect: "manual" });
  return { estado: res.status, location: res.headers.get("location"), cuerpo: await res.json().catch(() => ({})) };
}

async function canjear(base, codigo) {
  const res = await fetch(base + "/api/auth/oauth/canjear", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ codigo }),
  });
  return { estado: res.status, cuerpo: await res.json().catch(() => ({})) };
}

describe("PBI-8: flujo OAuth en endpoints", () => {
  it("el inicio redirige a GitHub con el client_id", async () => {
    const { server, base } = await arrancar(crearOAuthFalso());
    try {
      const r = await llamar(base, "/api/auth/oauth/github");
      assert.equal(r.estado, 302);
      assert.ok(r.location.includes("github.com/login/oauth/authorize"));
      assert.ok(r.location.includes("client_id=falso"));
    } finally {
      server.close();
    }
  });

  it("sin credenciales el inicio da 501 honesto (no redirige a roto)", async () => {
    const { server, base } = await arrancar({ configurado: false });
    try {
      const res = await fetch(base + "/api/auth/oauth/github");
      assert.equal(res.status, 501);
    } finally {
      server.close();
    }
  });

  it("callback bueno crea activo y redirige con código temporal (sin token en la URL)", async () => {
    const { server, datos, base } = await arrancar(crearOAuthFalso());
    try {
      const r = await llamar(base, "/api/auth/oauth/github/callback?code=codigo-bueno");
      assert.equal(r.estado, 302);
      const destino = new URL(r.location);
      assert.equal(destino.searchParams.get("token"), null);
      assert.equal(destino.searchParams.get("email"), null);
      const codigo = destino.searchParams.get("oauth_code");
      assert.ok(codigo);
      const canje = await canjear(base, codigo);
      assert.equal(canje.estado, 200);
      assert.ok(canje.cuerpo.token);
      assert.equal(canje.cuerpo.usuario.email, "octo@ejemplo.com");
      const logica = new Logica(datos, { costeHash: 4 });
      assert.equal(logica.isActive("octo@ejemplo.com"), true);
      assert.equal(logica.obtenerSesion(canje.cuerpo.token).usuario.email, "octo@ejemplo.com");
    } finally {
      server.close();
    }
  });

  it("un código ya canjeado no se puede reutilizar", async () => {
    const { server, base } = await arrancar(crearOAuthFalso());
    try {
      const r = await llamar(base, "/api/auth/oauth/github/callback?code=codigo-bueno");
      const codigo = new URL(r.location).searchParams.get("oauth_code");
      assert.equal((await canjear(base, codigo)).estado, 200);
      assert.equal((await canjear(base, codigo)).estado, 404);
    } finally {
      server.close();
    }
  });

  it("un código inválido o ausente da 404", async () => {
    const { server, base } = await arrancar(crearOAuthFalso());
    try {
      assert.equal((await canjear(base, "inventado")).estado, 404);
      assert.equal((await canjear(base, undefined)).estado, 404);
    } finally {
      server.close();
    }
  });

  it("un código caducado da 404", async () => {
    const { server, datos, base } = await arrancar(crearOAuthFalso());
    try {
      const r = await llamar(base, "/api/auth/oauth/github/callback?code=codigo-bueno");
      const codigo = new URL(r.location).searchParams.get("oauth_code");
      datos.codigosOAuth.get(codigo).expira = Date.now() - 1;
      assert.equal((await canjear(base, codigo)).estado, 404);
    } finally {
      server.close();
    }
  });

  it("callback con código malo redirige con oauth_error y no crea a nadie", async () => {
    const { server, datos, base } = await arrancar(crearOAuthFalso());
    try {
      const r = await llamar(base, "/api/auth/oauth/github/callback?code=codigo-malo");
      assert.equal(r.estado, 302);
      assert.ok(new URL(r.location).searchParams.get("oauth_error"));
      assert.equal(new Logica(datos).listar().length, 0);
    } finally {
      server.close();
    }
  });
});
