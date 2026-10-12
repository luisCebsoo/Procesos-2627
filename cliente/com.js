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
