/**
 * Smoke tests del esqueleto PBI-1 (runner built-in node:test).
 * En PBI-2 se amplían a >=5 tests de logica.js (felices + error).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

describe("esqueleto PBI-1", () => {
  it("logica se construye sobre datos (frontera api->logica->datos)", () => {
    const datos = new Datos();
    const logica = new Logica(datos);
    assert.equal(logica.datos, datos);
    assert.deepEqual(logica.getStatus(), { ok: true, servicio: "procesos-2627", usuarios: 0 });
  });

  it("logica exige instancia de Datos", () => {
    assert.throws(() => new Logica(), /Datos/);
  });

  it("GET /api/health responde 200 con JSON", async () => {
    const app = createApp(new Logica(new Datos()));
    const server = app.listen(0);
    try {
      const port = server.address().port;
      const res = await fetch(`http://127.0.0.1:${port}/api/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.ok, true);
    } finally {
      server.close();
    }
  });

  it("backend sirve el frontend en el mismo origen (/)", async () => {
    const app = createApp(new Logica(new Datos()));
    const server = app.listen(0);
    try {
      const port = server.address().port;
      const res = await fetch(`http://127.0.0.1:${port}/`);
      assert.equal(res.status, 200);
      const html = await res.text();
      assert.match(html, /Procesos-2627/);
    } finally {
      server.close();
    }
  });
});
