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
  PROHIBIDO: 403,
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

  // Middleware de rol (PBI-6): solo admin activo (lectura fresca).
  const requerirAdmin = (req, res, next) => {
    if (logica.esAdmin(req.usuario.email)) {
      next();
    } else {
      log("warn", "acceso denegado: requiere admin", { email: req.usuario.email, ruta: req.path });
      enviarError(res, Object.assign(new Error("requiere rol administrador"), { code: "PROHIBIDO" }));
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

  // Listado solo-admin (PBI-6): 200 | 401 sin sesión | 403 sin rol
  app.get("/api/users", requerirAuth, requerirAdmin, (req, res) => {
    res.json(logica.listarComo(req.usuario.email));
  });

  // Consulta de activo solo-admin (PBI-6): 200 | 401 | 403 | 404
  app.get("/api/users/:email/active", requerirAuth, requerirAdmin, (req, res) => {
    try {
      const email = logica.normalizarEmail(req.params.email);
      res.json({ email, active: logica.consultarActivoComo(req.usuario.email, email) });
    } catch (err) {
      enviarError(res, err);
    }
  });

  // Borrado con permisos (PBI-6): admin->cualquiera, usuario->solo sí mismo.
  // -> 200 | 401 | 403 | 404
  app.delete("/api/users/:email", requerirAuth, (req, res) => {
    try {
      const email = logica.normalizarEmail(req.params.email);
      const resultado = logica.eliminarComo(req.usuario.email, email);
      log("info", "borrado usuario", { email, por: req.usuario.email });
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
  // PBI-5: la URI sale del entorno, nunca del código. Sin ella,
  // modo memoria (útil en local/CI); con ella, MongoDB persistente.
  // PBI-6: seed del primer admin por entorno (si hay ADMIN_EMAIL).
  datos
    .conectarDB(process.env.MONGODB_URI)
    .then((conectado) => {
      log("info", "persistencia lista", { modo: conectado ? "mongodb" : "memoria" });
      inicializarAdminDesdeEntorno(logica);
      app.listen(PORT, () => log("info", "servidor arrancado", { port: PORT }));
    })
    .catch((err) => {
      log("error", "no se pudo conectar a MongoDB", { detalle: err.message });
      process.exit(1);
    });
}

function inicializarAdminDesdeEntorno(logica) {
  const email = (process.env.ADMIN_EMAIL || "").trim();
  if (!email) {
    return false;
  }
  try {
    const admin = logica.inicializarAdmin(email, process.env.ADMIN_PASSWORD);
    log("info", "admin inicializado", { email: admin.email });
    return true;
  } catch (err) {
    log("error", "no se pudo inicializar el admin", { detalle: err.message });
    return false;
  }
}

module.exports = { createApp };
