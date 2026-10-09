/**
 * Capa API / transporte (PBI-1: esqueleto).
 *
 * Responsabilidad: HTTP + cableado. Sin reglas de negocio:
 * delega en Logica. Sirve al frontend desde el mismo origen
 * (el cliente jamás toca la BBDD).
 */
const path = require("path");
const express = require("express");

const Datos = require("./datos");
const Logica = require("./logica");

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
