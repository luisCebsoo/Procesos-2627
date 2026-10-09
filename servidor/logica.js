/**
 * Capa de lógica de negocio (PBI-2: gestión básica de usuarios).
 *
 * Frontera: solo conoce a Datos (inyectado por constructor).
 * NUNCA importa de api.js. Todas las reglas viven aquí; api.js
 * solo traduce los errores de dominio (err.code) a HTTP.
 *
 * Alcance PBI-2: alta, listado, estado activo y eliminación.
 * Sin contraseñas (PBI-3, con hash) ni sesiones/roles (Hito 2/3).
 *
 * Códigos de error de dominio:
 *   VALIDACION | DUPLICADO | ELIMINADO | NO_ENCONTRADO
 */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fallo(codigo, mensaje) {
  const err = new Error(mensaje);
  err.code = codigo;
  return err;
}

class Logica {
  /**
   * @param {import('./datos')} datos capa de persistencia
   */
  constructor(datos) {
    if (!datos) {
      throw new Error("Logica requiere una instancia de Datos");
    }
    this.datos = datos;
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
   * Alta: crea la cuenta en estado "pendiente" con rol "usuario".
   * (La activación llega en PBI-7; el login exigirá "activo" en PBI-3.)
   */
  alta(email, opts = {}) {
    const normalizado = this.normalizarEmail(email);
    if (!EMAIL_RE.test(normalizado)) {
      throw fallo("VALIDACION", "email inválido");
    }
    if (this.datos.fueEliminado(normalizado)) {
      throw fallo("ELIMINADO", "cuenta eliminada: no puede volver a entrar");
    }
    if (this.datos.buscarPorEmail(normalizado)) {
      throw fallo("DUPLICADO", "email ya registrado");
    }
    const usuario = {
      email: normalizado,
      nombre: typeof opts.nombre === "string" && opts.nombre.trim() ? opts.nombre.trim() : null,
      rol: "usuario",
      estado: "pendiente",
      creadoEn: new Date().toISOString(),
    };
    this.datos.guardarUsuario(usuario);
    return this.vista(usuario);
  }

  /**
   * Listado: solo expone email, rol y estado (nunca datos internos).
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

  vista(u) {
    return { email: u.email, nombre: u.nombre, rol: u.rol, estado: u.estado };
  }
}

module.exports = Logica;
