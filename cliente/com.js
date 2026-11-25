/**
 * Capa de comunicación del cliente ("com" del diagrama).
 *
 * Única parte del frontend que habla con la API REST.
 * No toca el DOM ni contiene reglas de negocio. Guarda el
 * token de sesión (localStorage) y lo reenvía en cada llamada.
 */
"use strict";

const Com = {
  CLAVE_SESION: "procesos2627.sesion",

  async pedir(metodo, ruta, cuerpo, conAuth = false) {
    const cabeceras = { "Content-Type": "application/json" };
    if (conAuth) {
      const sesion = this.leerSesion();
      if (sesion && sesion.token) {
        cabeceras.Authorization = "Bearer " + sesion.token;
      }
    }
    const res = await fetch(ruta, {
      method: metodo,
      headers: cabeceras,
      body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
    });
    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      if (res.status === 401 && conAuth) {
        this.limpiarSesion(); // token muerto: no insistir tras F5
      }
      throw new Error(datos.error || ("fallo " + res.status));
    }
    return datos;
  },

  health() {
    return this.pedir("GET", "/api/health");
  },

  registro(email, password, nombre) {
    return this.pedir("POST", "/api/auth/registro", { email, password, nombre });
  },

  async login(email, password) {
    const sesion = await this.pedir("POST", "/api/auth/login", { email, password });
    this.guardarSesion(sesion);
    return sesion;
  },

  // Canjea el código de un solo uso del callback OAuth por la sesión.
  async canjearCodigoOAuth(codigo) {
    const sesion = await this.pedir("POST", "/api/auth/oauth/canjear", { codigo });
    this.guardarSesion(sesion);
    return sesion;
  },

  // Guarda una sesión ya creada (login local o vuelta de OAuth).
  guardarSesion(sesion) {
    localStorage.setItem(this.CLAVE_SESION, JSON.stringify(sesion));
  },

  // Revalida la sesión guardada contra el servidor (F5).
  async me() {
    const usuario = await this.pedir("GET", "/api/auth/me", undefined, true);
    const sesion = this.leerSesion() || {};
    sesion.usuario = usuario;
    localStorage.setItem(this.CLAVE_SESION, JSON.stringify(sesion));
    return usuario;
  },

  // Cierre de sesión: invalida en servidor y limpia en cliente.
  async logout() {
    try {
      await this.pedir("POST", "/api/auth/logout", undefined, true);
    } finally {
      this.limpiarSesion();
    }
    return { ok: true };
  },

  leerSesion() {
    try {
      return JSON.parse(localStorage.getItem(this.CLAVE_SESION)) || null;
    } catch {
      return null;
    }
  },

  // Solo-admin (PBI-6): el servidor decide; aquí solo se pide y muestra.
  listarUsuarios() {
    return this.pedir("GET", "/api/users", undefined, true);
  },

  borrarUsuario(email) {
    return this.pedir("DELETE", "/api/users/" + encodeURIComponent(email), undefined, true);
  },

  // — Despensa de café (PBI-9) —
  listarBolsas() {
    return this.pedir("GET", "/api/bolsas", undefined, true);
  },

  crearBolsa(datos) {
    return this.pedir("POST", "/api/bolsas", datos, true);
  },

  borrarBolsa(id) {
    return this.pedir("DELETE", "/api/bolsas/" + encodeURIComponent(id), undefined, true);
  },

  // — Diario de extracciones y cálculo de ratios (PBI-10) —
  listarExtracciones() {
    return this.pedir("GET", "/api/extracciones", undefined, true);
  },

  crearExtraccion(datos) {
    return this.pedir("POST", "/api/extracciones", datos, true);
  },

  borrarExtraccion(id) {
    return this.pedir("DELETE", "/api/extracciones/" + encodeURIComponent(id), undefined, true);
  },

  // — Recetas de comunidad, moderación y métricas (PBI-11) —
  listarComunidad(params = {}) {
    const q = new URLSearchParams();
    if (params.metodo) q.set("metodo", params.metodo);
    if (params.buscar) q.set("buscar", params.buscar);
    q.set("incluirMaestras", params.incluirMaestras !== undefined ? String(params.incluirMaestras) : "true");
    const qs = "?" + q.toString();
    return this.pedir("GET", "/api/comunidad" + qs, undefined, true);
  },

  moderarReceta(id, accion) {
    return this.pedir("POST", "/api/admin/extracciones/" + encodeURIComponent(id) + "/moderar", { accion }, true);
  },

  obtenerMetricas() {
    return this.pedir("GET", "/api/admin/metricas", undefined, true);
  },

  // — Experiencia V2.0: Descubrir Café y Consumo Semanal —
  descubrirCatalogo(criterios = {}) {
    const q = new URLSearchParams();
    if (criterios.cafeina) q.set("cafeina", criterios.cafeina);
    if (criterios.tipoConsumo) q.set("tipoConsumo", criterios.tipoConsumo);
    if (criterios.cafetera) q.set("cafetera", criterios.cafetera);
    if (criterios.perfilSabor) q.set("perfilSabor", criterios.perfilSabor);
    if (criterios.intensidad) q.set("intensidad", criterios.intensidad);
    if (criterios.buscar) q.set("buscar", criterios.buscar);
    const qs = q.toString() ? "?" + q.toString() : "";
    return this.pedir("GET", "/api/catalogo/descubrir" + qs);
  },

  importarCafeADespensa(id, gramosIniciales = 250) {
    return this.pedir("POST", "/api/catalogo/" + encodeURIComponent(id) + "/importar", { gramosIniciales }, true);
  },

  importarCafe(id, gramosIniciales = 250) {
    return this.importarCafeADespensa(id, gramosIniciales);
  },

  consumoSemanal() {
    return this.pedir("GET", "/api/extracciones/consumo-semanal", undefined, true);
  },

  obtenerConsumoSemanal() {
    return this.consumoSemanal();
  },

  // Canje del enlace de activación (PBI-7, página pública).
  verificar(token) {
    return this.pedir("GET", "/api/auth/verificar/" + encodeURIComponent(token));
  },

  limpiarSesion() {
    localStorage.removeItem(this.CLAVE_SESION);
  },
};

// Expuesto globalmente para app.js (sin bundler).
window.Com = Com;
