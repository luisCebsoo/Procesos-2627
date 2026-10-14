/**
 * Seed manual del administrador (entrega y defensa).
 * Uso: npm run seed:admin
 *
 * Asegura de forma idempotente que el admin exista con rol "admin",
 * estado "activo" y la contraseña dada (hash bcrypt):
 *  - Si no existe: lo crea activo con esa contraseña.
 *  - Si existe: fija rol/estado y, si su hash no coincide, lo regenera
 *    (así el login con esa contraseña funciona siempre).
 * Además verifica que el login devuelva rol "admin" en la sesión.
 *
 * Email y contraseña salen de ADMIN_EMAIL/ADMIN_PASSWORD; sin ellas se
 * usan valores de demostración SOLO para local/defensa (ver aviso en
 * el log). Funciona contra MongoDB (MONGODB_URI) o memoria.
 */
require("dotenv").config();

const bcrypt = require("bcryptjs");
const Datos = require("./datos");
const Logica = require("./logica");

const EMAIL_DEFECTO = "admin@procesos.com";
const PASS_DEFECTO = "Admin1234!";

function log(level, msg, extra = {}) {
  console.log(JSON.stringify({ t: new Date().toISOString(), level, msg, ...extra }));
}

async function asegurarAdmin({ datos, logica, email, password }) {
  const normalizado = logica.normalizarEmail(email);
  const previo = datos.buscarPorEmail(normalizado);
  const vista = logica.inicializarAdmin(normalizado, password);
  const accion = previo ? "actualizado" : "creado";
  // Garantiza la contraseña: si no hay hash o no coincide, lo regenera.
  const guardado = datos.buscarPorEmail(normalizado);
  let clave = "ok";
  if (!guardado.hash || !bcrypt.compareSync(password, guardado.hash)) {
    guardado.hash = bcrypt.hashSync(password, logica.costeHash);
    datos.guardarUsuario(guardado);
    clave = "restablecida";
  }
  return { email: vista.email, rol: vista.rol, estado: vista.estado, accion, clave };
}

async function main() {
  const email = (process.env.ADMIN_EMAIL || "").trim() || EMAIL_DEFECTO;
  const password = process.env.ADMIN_PASSWORD || PASS_DEFECTO;
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) {
    log("warn", "sin ADMIN_EMAIL/ADMIN_PASSWORD: usando credenciales de demostración (solo local/defensa)");
  }
  const datos = new Datos();
  const persistente = await datos.conectarDB(process.env.MONGODB_URI);
  if (!persistente) {
    log("warn", "sin MONGODB_URI: modo memoria (el seed se pierde al salir)");
  }
  const logica = new Logica(datos);
  const resultado = await asegurarAdmin({ datos, logica, email, password });
  // Verificación: el login devuelve rol "admin" en la sesión.
  const sesion = logica.login(resultado.email, password);
  log("info", "admin listo", {
    email: resultado.email,
    rol: sesion.usuario.rol,
    estado: sesion.usuario.estado,
    accion: resultado.accion,
    clave: resultado.clave,
    modo: persistente ? "mongodb" : "memoria",
  });
  // Espera escrituras en vuelo antes de cerrar (si no, se perderían).
  await datos.sincronizar();
  await datos.cerrarDB();
}

if (require.main === module) {
  main().then(
    () => process.exit(0),
    (err) => {
      log("error", "fallo el seed de admin", { detalle: err.message });
      process.exit(1);
    }
  );
}

module.exports = { asegurarAdmin, EMAIL_DEFECTO };
