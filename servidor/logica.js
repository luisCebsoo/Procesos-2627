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
 *   CREDENCIALES | PENDIENTE | PROHIBIDO
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
   * Revalida la sesión actual (PBI-4: persistencia tras F5).
   * Devuelve el perfil del usuario autenticado si el token es válido.
   */
  obtenerSesion(token) {
    if (!token || typeof token !== "string") {
      throw fallo("CREDENCIALES", "sesión inválida o token ausente");
    }
    const email = this.datos.buscarSesion(token);
    if (!email) {
      throw fallo("CREDENCIALES", "sesión inválida o expirada");
    }
    if (this.datos.fueEliminado(email)) {
      this.datos.eliminarSesion(token);
      throw fallo("ELIMINADO", "cuenta eliminada");
    }
    const u = this.datos.buscarPorEmail(email);
    if (!u) {
      this.datos.eliminarSesion(token);
      throw fallo("CREDENCIALES", "usuario no encontrado");
    }
    return { token, usuario: this.vista(u) };
  }

  /**
   * Cierre de sesión (PBI-4): invalida el token en el servidor.
   */
  logout(token) {
    if (token) {
      this.datos.eliminarSesion(token);
    }
    return { ok: true };
  }

  /**
   * Login externo OAuth (PBI-8): el proveedor ya verificó el email,
   * así que la cuenta nace (o queda) "activa" sin email de confirmación
   * y genera una sesión válida directamente. Respeta tumbas y roles.
   */
  loginExterno(email, nombre, proveedor) {
    const normalizado = this.normalizarEmail(email);
    if (!EMAIL_RE.test(normalizado)) {
      throw fallo("VALIDACION", "email inválido");
    }
    if (this.datos.fueEliminado(normalizado)) {
      throw fallo("ELIMINADO", "cuenta eliminada: no puede volver a entrar");
    }
    let u = this.datos.buscarPorEmail(normalizado);
    if (!u) {
      u = {
        email: normalizado,
        nombre: typeof nombre === "string" && nombre.trim() ? nombre.trim() : null,
        hash: null,
        rol: "usuario",
        estado: "activo",
        proveedor: proveedor || null,
        creadoEn: new Date().toISOString(),
      };
    } else {
      u.estado = "activo";
      if (!u.proveedor && proveedor) {
        u.proveedor = proveedor;
      }
    }
    this.datos.guardarUsuario(u);
    const token = randomUUID();
    this.datos.guardarSesion(token, normalizado);
    return { token, usuario: this.vista(u) };
  }

  /**
   * Listado: solo expone email, rol y estado (nunca hash ni internos).
   * Sin solicitante (compat PBI-2). Con roles: usar listarComo().
   */
  listar() {
    return this.datos.listarUsuarios().map((u) => ({
      email: u.email,
      rol: u.rol,
      estado: u.estado,
    }));
  }

  /**
   * Roles (PBI-6): ¿es administrador activo? Lectura fresca desde datos
   * (el rol puede haber cambiado tras emitir la sesión).
   */
  esAdmin(email) {
    const u = this.datos.buscarPorEmail(this.normalizarEmail(email));
    return !!u && u.rol === "admin" && u.estado === "activo";
  }

  /**
   * Exige rol admin al solicitante. Desconocido o sin rol -> PROHIBIDO
   * (no se distingue, para no enumerar quién existe).
   */
  exigirAdmin(solicitante) {
    if (!this.esAdmin(solicitante)) {
      throw fallo("PROHIBIDO", "requiere rol administrador");
    }
  }

  /**
   * Listado solo-admin (PBI-6). La API lo protege además con middleware.
   */
  listarComo(solicitante) {
    this.exigirAdmin(solicitante);
    return this.listar();
  }

  /**
   * Consulta de activo solo-admin (PBI-6).
   */
  consultarActivoComo(solicitante, email) {
    this.exigirAdmin(solicitante);
    return this.isActive(email);
  }

  /**
   * Borrado con reparto de permisos (PBI-6, validado en servidor):
   * admin -> cualquiera; usuario estándar -> solo su propia cuenta.
   */
  eliminarComo(solicitante, objetivo) {
    const yo = this.normalizarEmail(solicitante);
    const otro = this.normalizarEmail(objetivo);
    if (yo !== otro) {
      this.exigirAdmin(yo);
    } else if (!this.datos.buscarPorEmail(yo)) {
      throw fallo("PROHIBIDO", "requiere rol administrador");
    }
    return this.eliminar(otro);
  }

  /**
   * Seed del primer admin (PBI-6): con ADMIN_EMAIL/ADMIN_PASSWORD del
   * entorno. Si existe, lo asciende a admin activo (conserva su hash);
   * si no, lo crea activo con la contraseña dada. La justificación y
   * las variables están documentadas en README (sin secretos en código).
   */
  inicializarAdmin(email, password) {
    const normalizado = this.normalizarEmail(email);
    if (!EMAIL_RE.test(normalizado)) {
      throw fallo("VALIDACION", "email de admin inválido");
    }
    if (this.datos.fueEliminado(normalizado)) {
      throw fallo("ELIMINADO", "cuenta eliminada: no puede volver a entrar");
    }
    const existente = this.datos.buscarPorEmail(normalizado);
    if (existente) {
      existente.rol = "admin";
      existente.estado = "activo";
      this.datos.guardarUsuario(existente);
      return this.vista(existente);
    }
    if (typeof password !== "string" || password.length < MIN_PASSWORD) {
      throw fallo("VALIDACION", `la contraseña necesita ${MIN_PASSWORD} caracteres mínimo`);
    }
    const admin = {
      email: normalizado,
      nombre: null,
      hash: bcrypt.hashSync(password, this.costeHash),
      rol: "admin",
      estado: "activo",
      creadoEn: new Date().toISOString(),
    };
    this.datos.guardarUsuario(admin);
    return this.vista(admin);
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
   * Activación pendiente -> activo (uso interno y seed de admin).
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
   * Genera el token único de verificación (PBI-7) para una cuenta
   * pendiente. La API lo convierte en enlace y lo envía por email.
   */
  solicitarVerificacion(email) {
    const normalizado = this.normalizarEmail(email);
    const u = this.datos.buscarPorEmail(normalizado);
    if (!u) {
      throw fallo("NO_ENCONTRADO", "usuario no encontrado");
    }
    if (u.estado === "activo") {
      throw fallo("VALIDACION", "la cuenta ya está activa");
    }
    const token = randomUUID();
    this.datos.guardarVerificacion(token, normalizado);
    return { email: normalizado, token };
  }

  /**
   * Canjea el enlace de activación (PBI-7): el token es de un solo
   * uso (se consume antes de activar) y lo falso/caducado da 404.
   */
  verificarCuenta(token) {
    if (!token || typeof token !== "string") {
      throw fallo("NO_ENCONTRADO", "enlace inválido o expirado");
    }
    const email = this.datos.buscarVerificacion(token);
    if (!email) {
      throw fallo("NO_ENCONTRADO", "enlace inválido o expirado");
    }
    this.datos.eliminarVerificacion(token);
    const u = this.datos.buscarPorEmail(email);
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
