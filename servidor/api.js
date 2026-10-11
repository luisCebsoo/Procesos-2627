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
  CREDENCIALES: 401,
  PENDIENTE: 403,
  ELIMINADO: 403,
  DUPLICADO: 409,
  NO_ENCONTRADO: 404,
};

function enviarError(res, err) {
  const estado = ESTADO_POR_CODIGO[err.code] || 500;
  if (!err.code) {
    log("error", "error interno", { detalle: err.message });
  }
  res.status(estado).json({ error: err.code ? err.message : "error interno" });
}

function extraerToken(req) {
  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    return authHeader.substring(7).trim();
  }
  return null;
}

function createApp(logica) {
  const app = express();
  app.use(express.json());

  // Middleware de autenticación para rutas privadas
  const requerirAuth = (req, res, next) => {
    try {
      const token = extraerToken(req);
      const sesion = logica.obtenerSesion(token);
      req.token = token;
      req.sesion = sesion;
      req.usuario = sesion.usuario;
      next();
    } catch (err) {
      enviarError(res, err);
    }
  };

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

  // Registro local (PBI-3): POST /api/auth/registro { email, password, nombre? }
  // -> 201 (pendiente, sin token) | 400 | 409 | 403
  app.post("/api/auth/registro", (req, res) => {
    try {
      const cuerpo = req.body || {};
      const creado = logica.registrar(cuerpo.email, cuerpo.password, { nombre: cuerpo.nombre });
      log("info", "registro usuario", { email: creado.email });
      res.status(201).json(creado);
    } catch (err) {
      enviarError(res, err);
    }
  });

  // Login local (PBI-3): POST /api/auth/login { email, password }
  // -> 200 { token, usuario } | 401 | 403
  app.post("/api/auth/login", (req, res) => {
    try {
      const cuerpo = req.body || {};
      const sesion = logica.login(cuerpo.email, cuerpo.password);
      log("info", "login usuario", { email: sesion.usuario.email });
      res.json(sesion);
    } catch (err) {
      enviarError(res, err);
    }
  });

  // Revalidación de sesión (PBI-4): GET /api/auth/me (protegido por token)
  // -> 200 usuario | 401
  app.get("/api/auth/me", requerirAuth, (req, res) => {
    res.json(req.usuario);
  });

  // Logout (PBI-4): POST /api/auth/logout (protegido por token)
  // -> 200 { ok: true } | 401
  app.post("/api/auth/logout", requerirAuth, (req, res) => {
    logica.logout(req.token);
    log("info", "logout usuario", { email: req.usuario.email });
    res.json({ ok: true });
  });

  // Rutas de administración / consulta protegidas (PBI-4 / PBI-6)
  app.get("/api/users", requerirAuth, (req, res) => {
    res.json(logica.listar());
  });

  app.get("/api/users/:email/active", requerirAuth, (req, res) => {
    try {
      const email = logica.normalizarEmail(req.params.email);
      res.json({ email, active: logica.isActive(email) });
    } catch (err) {
      enviarError(res, err);
    }
  });

  app.delete("/api/users/:email", requerirAuth, (req, res) => {
    try {
      const email = logica.normalizarEmail(req.params.email);
      const resultado = logica.eliminar(email);
      log("info", "borrado usuario", { email });
      res.json(resultado);
    } catch (err) {
      enviarError(res, err);
    }
  });

  // Rutas /api desconocidas -> 404 JSON (último: no tapa a las rutas reales).
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
