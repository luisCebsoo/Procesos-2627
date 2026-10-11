/**
 * Capa de lógica de negocio (PBI-3: registro y login locales).
 *
 * Frontera: solo conoce a Datos (inyectado por constructor).
 * NUNCA importa de api.js. Todas las reglas viven aquí; api.js
 * solo traduce los errores de dominio (err.code) a HTTP.
 *
 * Seguridad: contraseñas solo con bcrypt (hash irreversible),
 * jamás en plano ni reversibles. El hash nunca sale en vistas.
 * Sesiones: token aleatorio (randomUUID) -> email, en memoria.
 * (Persistencia tras F5, logout e invalidación: PBI-4.)
 *
 * Códigos de error de dominio:
 *   VALIDACION | DUPLICADO | ELIMINADO | NO_ENCONTRADO |
 *   CREDENCIALES | PENDIENTE
 */
const bcrypt = require("bcryptjs");
const { randomUUID } = require("crypto");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD = 8;

function fallo(codigo, mensaje) {
  const err = new Error(mensaje);
  err.code = codigo;
  return err;
}

class Logica {
  /**
   * @param {import('./datos')} datos capa de persistencia
   * @param {{ costeHash?: number }} opts (tests usan coste bajo)
   */
  constructor(datos, opts = {}) {
    if (!datos) {
      throw new Error("Logica requiere una instancia de Datos");
    }
    this.datos = datos;
    this.costeHash =
      Number(opts.costeHash) || Number(process.env.BCRYPT_COST) || 10;
  }

  /**
   * Estado del servicio (usado por /api/health).
   */
  getStatus() {
    return { ok: true, servicio: "procesos-2627", usuarios: this.datos.listarUsuarios().length };
  }

  normalizarEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  /**
   * Alta base (PBI-2): identidad sin credencial. El login la rechaza
   * hasta que se registre contraseña (o la active PBI-7 + registro).
   */
  alta(email, opts = {}) {
    const normalizado = this.normalizarEmail(email);
    this.comprobarDisponible(normalizado);
    const usuario = {
      email: normalizado,
      nombre: this.limpiarNombre(opts.nombre),
      rol: "usuario",
      estado: "pendiente",
      creadoEn: new Date().toISOString(),
    };
    this.datos.guardarUsuario(usuario);
    return this.vista(usuario);
  }

  /**
   * Registro local (PBI-3): alta + contraseña con hash bcrypt.
   * Crea la cuenta en "pendiente": NO puede loguearse hasta activar.
   */
  registrar(email, password, opts = {}) {
    const normalizado = this.normalizarEmail(email);
    this.comprobarDisponible(normalizado);
    if (typeof password !== "string" || password.length < MIN_PASSWORD) {
      throw fallo("VALIDACION", `la contraseña necesita ${MIN_PASSWORD} caracteres mínimo`);
    }
    const usuario = {
      email: normalizado,
      nombre: this.limpiarNombre(opts.nombre),
      hash: bcrypt.hashSync(password, this.costeHash),
      rol: "usuario",
      estado: "pendiente",
      creadoEn: new Date().toISOString(),
    };
    this.datos.guardarUsuario(usuario);
    return this.vista(usuario);
  }

  /**
   * Login local (PBI-3): valida credenciales y genera la sesión.
   * No distingue "no existe" de "password mal" (no enumera usuarios).
   */
  login(email, password) {
    const normalizado = this.normalizarEmail(email);
    if (this.datos.fueEliminado(normalizado)) {
      throw fallo("ELIMINADO", "cuenta eliminada: no puede volver a entrar");
    }
    const u = this.datos.buscarPorEmail(normalizado);
    if (!u || !u.hash || !bcrypt.compareSync(String(password || ""), u.hash)) {
      throw fallo("CREDENCIALES", "credenciales inválidas");
    }
    if (u.estado !== "activo") {
      throw fallo("PENDIENTE", "cuenta pendiente de activación");
    }
    const token = randomUUID();
    this.datos.guardarSesion(token, normalizado);
    return { token, usuario: this.vista(u) };
  }

  /**
   * Listado: solo expone email, rol y estado (nunca hash ni internos).
   */
  listar() {
    return this.datos.listarUsuarios().map((u) => ({
      email: u.email,
      rol: u.rol,
      estado: u.estado,
    }));
  }

  /**
   * ¿Está activo? (activo = confirmado y no eliminado).
   */
  isActive(email) {
    const u = this.datos.buscarPorEmail(this.normalizarEmail(email));
    if (!u) {
      throw fallo("NO_ENCONTRADO", "usuario no encontrado");
    }
    return u.estado === "activo";
  }

  /**
   * Activación pendiente -> activo. La usará el enlace de PBI-7.
   */
  activar(email) {
    const normalizado = this.normalizarEmail(email);
    const u = this.datos.buscarPorEmail(normalizado);
    if (!u) {
      throw fallo("NO_ENCONTRADO", "usuario no encontrado");
    }
    u.estado = "activo";
    this.datos.guardarUsuario(u);
    return this.vista(u);
  }

  /**
   * Eliminación: borra y deja tumba para que no vuelva a entrar.
   * (El reparto admin/cualquiera vs usuario/sí-mismo llega en PBI-6 con sesiones.)
   */
  eliminar(email) {
    const normalizado = this.normalizarEmail(email);
    const u = this.datos.buscarPorEmail(normalizado);
    if (!u) {
      throw fallo("NO_ENCONTRADO", "usuario no encontrado");
    }
    this.datos.eliminarUsuario(normalizado);
    this.datos.marcarEliminado(normalizado);
    return { email: normalizado, eliminado: true };
  }

  comprobarDisponible(normalizado) {
    if (!EMAIL_RE.test(normalizado)) {
      throw fallo("VALIDACION", "email inválido");
    }
    if (this.datos.fueEliminado(normalizado)) {
      throw fallo("ELIMINADO", "cuenta eliminada: no puede volver a entrar");
    }
    if (this.datos.buscarPorEmail(normalizado)) {
      throw fallo("DUPLICADO", "email ya registrado");
    }
  }

  limpiarNombre(nombre) {
    return typeof nombre === "string" && nombre.trim() ? nombre.trim() : null;
  }

  vista(u) {
    return { email: u.email, nombre: u.nombre, rol: u.rol, estado: u.estado };
  }
}

module.exports = Logica;
