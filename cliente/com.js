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
    localStorage.setItem(this.CLAVE_SESION, JSON.stringify(sesion));
    return sesion;
  },

  leerSesion() {
    try {
      return JSON.parse(localStorage.getItem(this.CLAVE_SESION)) || null;
    } catch {
      return null;
    }
  },

  limpiarSesion() {
    localStorage.removeItem(this.CLAVE_SESION);
  },
};

// Expuesto globalmente para app.js (sin bundler).
window.Com = Com;
