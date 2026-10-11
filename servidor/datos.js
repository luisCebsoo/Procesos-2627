/**
 * Capa de persistencia (PBI-2: memoria + tumbas de eliminados).
 *
 * Responsabilidad: guardar/leer datos. No contiene reglas de negocio
 * ni conoce a la capa API. En Hito 3 se sustituye por BBDD real
 * manteniendo la misma interfaz para no tocar logica.js.
 */
class Datos {
  constructor() {
    // Almacenamiento temporal en memoria (Map email -> usuario).
    this.usuarios = new Map();
    // Tumbas: emails eliminados que no pueden volver a entrar.
    this.eliminados = new Set();
    // Sesiones: token -> email (PBI-3; expira/invalida en PBI-4).
    this.sesiones = new Map();
  }

  guardarUsuario(usuario) {
    this.usuarios.set(usuario.email, { ...usuario });
  }

  buscarPorEmail(email) {
    return this.usuarios.get(email) || null;
  }

  listarUsuarios() {
    return [...this.usuarios.values()];
  }

  eliminarUsuario(email) {
    return this.usuarios.delete(email);
  }

  marcarEliminado(email) {
    this.eliminados.add(email);
  }

  fueEliminado(email) {
    return this.eliminados.has(email);
  }

  guardarSesion(token, email) {
    this.sesiones.set(token, email);
  }

  buscarSesion(token) {
    return this.sesiones.get(token) || null;
  }

  eliminarSesion(token) {
    return this.sesiones.delete(token);
  }
}

module.exports = Datos;
