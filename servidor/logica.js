/**
 * Capa de lógica de negocio (PBI-1: esqueleto).
 *
 * Frontera: solo conoce a Datos (inyectado por constructor).
 * NUNCA importa de api.js. Las reglas de usuarios (alta, listado,
 * estado, borrado) se implementan en PBI-2 sobre esta clase.
 */
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
   * Estado del esqueleto (usado por /api/health y tests PBI-1).
   */
  getStatus() {
    return { ok: true, servicio: "procesos-2627", usuarios: this.datos.listarUsuarios().length };
  }
}

module.exports = Logica;
