/**
 * Capa API / transporte (PBI-2: usuarios + health).
 *
 * Responsabilidad: HTTP + cableado. Sin reglas de negocio:
 * delega en Logica y traduce err.code a estado HTTP.
 * Sirve al frontend desde el mismo origen (el cliente jamás
 * toca la BBDD).
 */
const path = require("path");
const express = require("express");

const Datos = require("./datos");
const Logica = require("./logica");

// Errores de dominio (logica.js) -> HTTP. Solo transporte.
const ESTADO_POR_CODIGO = {
  VALIDACION: 400,
  DUPLICADO: 409,
  ELIMINADO: 403,
  NO_ENCONTRADO: 404,
};

function enviarError(res, err) {
  const estado = ESTADO_POR_CODIGO[err.code] || 500;
  if (!err.code) {
    log("error", "error interno", { detalle: err.message });
  }
  res.status(estado).json({ error: err.code ? err.message : "error interno" });
}

function createApp(logica) {
  const app = express();
  app.use(express.json());

  // Frontend servido por el propio backend (mismo origen).
  const clienteDir = path.join(__dirname, "..", "cliente");
  app.use(express.static(clienteDir));

  // Health-check para CI/CD y demo del despliegue.
  app.get("/api/health", (req, res) => {
    res.json(logica.getStatus());
  });

  // Alta: POST /api/users { email, nombre? } -> 201 | 400 | 403 | 409
  app.post("/api/users", (req, res) => {
    try {
      const creado = logica.alta(req.body && req.body.email, { nombre: req.body && req.body.nombre });
      log("info", "alta usuario", { email: creado.email });
      res.status(201).json(creado);
    } catch (err) {
      enviarError(res, err);
    }
  });

  // Listado (email, rol, estado) -> 200
  // (Restricción a admin con sesiones: PBI-6.)
  app.get("/api/users", (req, res) => {
    res.json(logica.listar());
  });

  // ¿Activo? -> 200 { email, active } | 404
  app.get("/api/users/:email/active", (req, res) => {
    try {
      const email = logica.normalizarEmail(req.params.email);
      res.json({ email, active: logica.isActive(email) });
    } catch (err) {
      enviarError(res, err);
    }
  });

  // Borrado -> 200 | 404 (reparto de permisos: PBI-6 con sesiones.)
  app.delete("/api/users/:email", (req, res) => {
    try {
      const email = logica.normalizarEmail(req.params.email);
      const resultado = logica.eliminar(email);
      log("info", "borrado usuario", { email });
      res.json(resultado);
    } catch (err) {
      enviarError(res, err);
    }
  });

  // Rutas /api desconocidas -> 404 JSON (sin romper estáticos).
  app.use("/api", (req, res) => {
    res.status(404).json({ error: "ruta no encontrada" });
  });

  return app;
}

function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
}

if (require.main === module) {
  require("dotenv").config();
  const PORT = Number(process.env.PORT) || 3000;
  const datos = new Datos();
  const logica = new Logica(datos);
  const app = createApp(logica);
  app.listen(PORT, () => log("info", "servidor arrancado", { port: PORT }));
}

module.exports = { createApp };
