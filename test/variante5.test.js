/**
 * Tests de la VARIANTE-5: permiso para eliminar usuarios.
 * Cubren la función pura decidirEliminar (logica) y el endpoint
 * POST /api/prueba/eliminar (api). Etiqueta: variante5.
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Logica = require("../servidor/logica");
const Datos = require("../servidor/datos");
const { createApp } = require("../servidor/api");

// ── Tests unitarios de la función de lógica (sin HTTP, sin BBDD) ──

describe("variante5: decidirEliminar en logica", () => {
  it("variante5: usuario que elimina a otro es rechazado con NO_AUTORIZADO", () => {
    const resultado = Logica.decidirEliminar(
      { id: "u1", rol: "usuario" },
      { id: "u2", rol: "usuario" },
      0
    );
    assert.deepEqual(resultado, { permitido: false, motivo: "NO_AUTORIZADO" });
  });

  it("variante5: usuario puede eliminarse a sí mismo", () => {
    const resultado = Logica.decidirEliminar(
      { id: "u1", rol: "usuario" },
      { id: "u1", rol: "usuario" },
      0
    );
    assert.deepEqual(resultado, { permitido: true, motivo: null });
  });

  it("variante5: no se puede eliminar al último admin (admin borra a otro admin)", () => {
    const resultado = Logica.decidirEliminar(
      { id: "a1", rol: "admin" },
      { id: "a2", rol: "admin" },
      1
    );
    assert.deepEqual(resultado, { permitido: false, motivo: "ULTIMO_ADMIN" });
  });

  it("variante5: admin no puede eliminarse a sí mismo si es el último", () => {
    const resultado = Logica.decidirEliminar(
      { id: "a1", rol: "admin" },
      { id: "a1", rol: "admin" },
      1
    );
    assert.deepEqual(resultado, { permitido: false, motivo: "ULTIMO_ADMIN" });
  });

  it("variante5: admin puede eliminar a otro admin si hay más de uno", () => {
    const resultado = Logica.decidirEliminar(
      { id: "a1", rol: "admin" },
      { id: "a2", rol: "admin" },
      3
    );
    assert.deepEqual(resultado, { permitido: true, motivo: null });
  });

  it("variante5: admin puede eliminar a un usuario normal", () => {
    const resultado = Logica.decidirEliminar(
      { id: "a1", rol: "admin" },
      { id: "u1", rol: "usuario" },
      2
    );
    assert.deepEqual(resultado, { permitido: true, motivo: null });
  });

  it("variante5: rol desconocido devuelve error", () => {
    const resultado = Logica.decidirEliminar(
      { id: "x", rol: "superusuario" },
      { id: "y", rol: "usuario" },
      1
    );
    assert.ok(resultado.error);
  });
});

// ── Tests HTTP del endpoint POST /api/prueba/eliminar ──

describe("variante5: endpoint POST /api/prueba/eliminar", () => {
  async function arrancar() {
    const logica = new Logica(new Datos(), { costeHash: 4 });
    const app = createApp(logica);
    const server = app.listen(0);
    await new Promise((r) => server.on("listening", r));
    return { server, base: `http://127.0.0.1:${server.address().port}` };
  }

  async function post(base, cuerpo) {
    const res = await fetch(base + "/api/prueba/eliminar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpo),
    });
    return { estado: res.status, cuerpo: await res.json() };
  }

  it("variante5: ejemplo del enunciado u1 elimina a u2 → NO_AUTORIZADO", async () => {
    const { server, base } = await arrancar();
    try {
      const r = await post(base, {
        actor: { id: "u1", rol: "usuario" },
        objetivo: { id: "u2", rol: "usuario" },
        administradores: 1,
      });
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo, { permitido: false, motivo: "NO_AUTORIZADO" });
    } finally {
      server.close();
    }
  });

  it("variante5: datos ausentes devuelve 400", async () => {
    const { server, base } = await arrancar();
    try {
      const r = await post(base, { actor: { id: "u1", rol: "usuario" } });
      assert.equal(r.estado, 400);
      assert.ok(r.cuerpo.error);
    } finally {
      server.close();
    }
  });

  it("variante5: rol desconocido devuelve 400", async () => {
    const { server, base } = await arrancar();
    try {
      const r = await post(base, {
        actor: { id: "x", rol: "superusuario" },
        objetivo: { id: "y", rol: "usuario" },
        administradores: 1,
      });
      assert.equal(r.estado, 400);
      assert.ok(r.cuerpo.error);
    } finally {
      server.close();
    }
  });

  it("variante5: ULTIMO_ADMIN vía endpoint", async () => {
    const { server, base } = await arrancar();
    try {
      const r = await post(base, {
        actor: { id: "a1", rol: "admin" },
        objetivo: { id: "a1", rol: "admin" },
        administradores: 1,
      });
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo, { permitido: false, motivo: "ULTIMO_ADMIN" });
    } finally {
      server.close();
    }
  });

  it("variante5: caso permitido vía endpoint", async () => {
    const { server, base } = await arrancar();
    try {
      const r = await post(base, {
        actor: { id: "a1", rol: "admin" },
        objetivo: { id: "u1", rol: "usuario" },
        administradores: 2,
      });
      assert.equal(r.estado, 200);
      assert.deepEqual(r.cuerpo, { permitido: true, motivo: null });
    } finally {
      server.close();
    }
  });
});
