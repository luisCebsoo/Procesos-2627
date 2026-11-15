/**
 * Tests para la experiencia completa BrewLab V2.0:
 * - Catálogo y filtrado «Descubrir Café»
 * - Importación automática a despensa
 * - Métricas de consumo semanal
 * - Recetas maestras en comunidad
 * - Endpoints API correspondientes
 */
"use strict";

const { describe, it, beforeEach, afterEach } = require("node:test");
const assert = require("node:assert/strict");
const Datos = require("../servidor/datos");
const Logica = require("../servidor/logica");
const { createApp } = require("../servidor/api");

describe("V2.0: Catálogo y Descubrir Café en Logica", () => {
  let datos;
  let logica;

  beforeEach(() => {
    datos = new Datos();
    logica = new Logica(datos, { costeHash: 4 });
  });

  it("filtrarCatalogo: sin criterios retorna los 18 cafés curados", () => {
    const todos = logica.filtrarCatalogo();
    assert.equal(todos.length, 18);
    assert.ok(todos.every((c) => c.id && c.nombre && c.puntuacionSca >= 80));
  });

  it("filtrarCatalogo: filtra por cafeína (normal vs descafeinado)", () => {
    const descafeinados = logica.filtrarCatalogo({ cafeina: "descafeinado" });
    assert.equal(descafeinados.length, 2);
    assert.ok(descafeinados.some((c) => c.id === "colombia-huila-decaf"));

    const normales = logica.filtrarCatalogo({ cafeina: "normal" });
    assert.equal(normales.length, 16);
  });

  it("filtrarCatalogo: filtra por tipoConsumo (solo, con_leche, frio)", () => {
    const conLeche = logica.filtrarCatalogo({ tipoConsumo: "con_leche" });
    assert.ok(conLeche.length >= 4);
    assert.ok(conLeche.every((c) => c.tipoConsumo.includes("con_leche")));

    const frio = logica.filtrarCatalogo({ tipoConsumo: "frio" });
    assert.ok(frio.length >= 2);
    assert.ok(frio.every((c) => c.tipoConsumo.includes("frio")));
  });

  it("filtrarCatalogo: filtra por cafetera (italiana, espresso, filtro, prensa)", () => {
    const italiana = logica.filtrarCatalogo({ cafetera: "italiana" });
    assert.ok(italiana.length >= 4);
    assert.ok(italiana.every((c) => c.cafeteras.includes("italiana")));

    const filtro = logica.filtrarCatalogo({ cafetera: "filtro" });
    assert.ok(filtro.length >= 3);
    assert.ok(filtro.every((c) => c.cafeteras.includes("filtro")));
  });

  it("filtrarCatalogo: filtra por perfilSabor e intensidad", () => {
    const afrutados = logica.filtrarCatalogo({ perfilSabor: "afrutado" });
    assert.ok(afrutados.every((c) => c.perfilSabor === "afrutado"));

    const intensos = logica.filtrarCatalogo({ intensidad: "intensa" });
    assert.ok(intensos.every((c) => c.intensidad === "intensa"));
  });

  it("filtrarCatalogo: búsqueda por texto libre en notas, origen o nombre", () => {
    const buscaJazmin = logica.filtrarCatalogo({ buscar: "jazmín" });
    assert.equal(buscaJazmin.length, 2);
    assert.ok(buscaJazmin.some((c) => c.id === "etiopia-yirgacheffe"));

    const buscaBrasil = logica.filtrarCatalogo({ buscar: "brasil" });
    assert.equal(buscaBrasil.length, 1);
    assert.equal(buscaBrasil[0].origen, "Brasil");
  });

  it("importarCafeADespensa: añade una bolsa de 250g al usuario y falla si café no existe", () => {
    logica.registrar("barista@ejemplo.com", "password123");
    logica.activar("barista@ejemplo.com");

    // Café inexistente
    assert.throws(
      () => logica.importarCafeADespensa("barista@ejemplo.com", "cafe-inexistente"),
      (err) => err.code === "NO_ENCONTRADO"
    );

    // Importación exitosa
    const bolsa = logica.importarCafeADespensa("barista@ejemplo.com", "colombia-huila-santa-barbara", 250);
    assert.ok(bolsa.id);
    assert.equal(bolsa.nombre, "Colombia Huila Santa Bárbara");
    assert.equal(bolsa.gramosIniciales, 250);
    assert.equal(bolsa.gramosRestantes, 250);
    assert.equal(bolsa.usuarioEmail, "barista@ejemplo.com");

    const bolsasUsuario = logica.listarBolsas("barista@ejemplo.com");
    assert.equal(bolsasUsuario.length, 1);
    assert.equal(bolsasUsuario[0].id, bolsa.id);
  });
});

describe("V2.0: Consumo Semanal y Recetas Maestras en Logica", () => {
  let datos;
  let logica;

  beforeEach(() => {
    datos = new Datos();
    logica = new Logica(datos, { costeHash: 4 });
    logica.registrar("barista@ejemplo.com", "password123");
    logica.activar("barista@ejemplo.com");
  });

  it("obtenerConsumoSemanal: calcula correctamente gramos por día y reparto por método", () => {
    const bolsa = logica.importarCafeADespensa("barista@ejemplo.com", "brasil-cerrado", 500);

    // Sin extracciones
    const consumoVacio = logica.obtenerConsumoSemanal("barista@ejemplo.com");
    assert.equal(consumoVacio.totalGramos, 0);
    assert.equal(consumoVacio.totalExtracciones, 0);
    assert.equal(consumoVacio.dias.length, 7);

    // Añadir 2 extracciones hoy
    logica.registrarExtraccion("barista@ejemplo.com", {
      bolsaId: bolsa.id,
      metodo: "Espresso",
      cafeGramos: 18,
      aguaGramos: 36,
    });

    logica.registrarExtraccion("barista@ejemplo.com", {
      bolsaId: bolsa.id,
      metodo: "V60",
      cafeGramos: 15,
      aguaGramos: 250,
    });

    const consumo = logica.obtenerConsumoSemanal("barista@ejemplo.com");
    assert.equal(consumo.totalGramos, 33);
    assert.equal(consumo.totalExtracciones, 2);
    assert.ok(consumo.porMetodo.Espresso);
    assert.ok(consumo.porMetodo.V60);
    assert.equal(consumo.porMetodo.Espresso.gramos, 18);
    assert.equal(consumo.porMetodo.V60.gramos, 15);
    assert.equal(
      Number((consumo.porMetodo.Espresso.porcentaje + consumo.porMetodo.V60.porcentaje).toFixed(1)),
      100
    );
  });

  it("recetas maestras: precargadas con enlaces reales e integradas con flag incluirMaestras", () => {
    const maestras = datos.listarRecetasMaestras();
    assert.equal(maestras.length, 6);
    assert.ok(maestras.every((r) => r.esMaestra && r.urlExterna && r.urlExterna.startsWith("http")));

    // listarComunidad sin incluirMaestras -> 0 si no hay recetas de usuarios
    const sinMaestras = logica.listarComunidad();
    assert.equal(sinMaestras.length, 0);

    // listarComunidad con incluirMaestras -> 6
    const conMaestras = logica.listarComunidad({ incluirMaestras: true });
    assert.equal(conMaestras.length, 6);

    // Filtro por método en maestras
    const soloEspresso = logica.listarComunidad({ incluirMaestras: true, metodo: "Espresso" });
    assert.equal(soloEspresso.length, 1);
    assert.equal(soloEspresso[0].id, "receta-maestra-inei-espresso");
  });
});

describe("V2.0: Endpoints API Catálogo y Consumo", () => {
  let app;
  let datos;
  let logica;
  let token;
  let server;
  let baseUrl;

  beforeEach(async () => {
    datos = new Datos();
    logica = new Logica(datos, { costeHash: 4 });
    app = createApp(logica);

    logica.registrar("barista@ejemplo.com", "password123");
    logica.activar("barista@ejemplo.com");
    const sesion = logica.login("barista@ejemplo.com", "password123");
    token = sesion.token;

    await new Promise((resolve) => {
      server = app.listen(0, "127.0.0.1", () => {
        const port = server.address().port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterEach(async () => {
    if (server) {
      await new Promise((resolve) => server.close(resolve));
    }
  });

  it("GET /api/catalogo/descubrir devuelve lista con filtros", async () => {
    const res = await fetch(`${baseUrl}/api/catalogo/descubrir?cafeina=descafeinado`);
    assert.equal(res.status, 200);
    const cafes = await res.json();
    assert.equal(cafes.length, 2);
    assert.ok(cafes.some((c) => c.id === "colombia-huila-decaf"));
  });

  it("POST /api/catalogo/:id/importar crea la bolsa y devuelve 201", async () => {
    const res = await fetch(`${baseUrl}/api/catalogo/etiopia-yirgacheffe/importar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ gramosIniciales: 250 }),
    });
    assert.equal(res.status, 201);
    const data = await res.json();
    assert.equal(data.bolsa.nombre, "Etiopía Yirgacheffe Aricha");
    assert.equal(data.bolsa.gramosIniciales, 250);
  });

  it("GET /api/extracciones/consumo-semanal devuelve resumen de 7 días", async () => {
    const res = await fetch(`${baseUrl}/api/extracciones/consumo-semanal`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(res.status, 200);
    const resumen = await res.json();
    assert.equal(resumen.dias.length, 7);
    assert.equal(typeof resumen.totalGramos, "number");
  });

  it("GET /api/comunidad?incluirMaestras=true devuelve recetas maestras con enlaces", async () => {
    const res = await fetch(`${baseUrl}/api/comunidad?incluirMaestras=true`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });
    assert.equal(res.status, 200);
    const recetas = await res.json();
    assert.ok(recetas.length >= 6);
    assert.ok(recetas.some((r) => r.esMaestra === true && r.urlExterna));
  });
});
