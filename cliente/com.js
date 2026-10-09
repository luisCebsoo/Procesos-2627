/**
 * Capa de comunicación del cliente ("com" del diagrama).
 *
 * Única parte del frontend que habla con la API REST.
 * No toca el DOM ni contiene reglas de negocio.
 */
"use strict";

const Com = {
  async health() {
    const res = await fetch("/api/health");
    if (!res.ok) {
      throw new Error("health failed: " + res.status);
    }
    return res.json();
  },
};

// Expuesto globalmente para app.js (sin bundler en PBI-1).
window.Com = Com;
