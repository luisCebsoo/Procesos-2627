/**
 * GUI + controlador del cliente.
 *
 * Habla con el servidor SOLO a través de Com (nunca fetch directo
 * a negocio ni acceso a datos). En PBI-3/4 aquí irán registro/login.
 */
"use strict";

(async function () {
  const el = document.getElementById("estado");
  try {
    const data = await window.Com.health();
    el.textContent = "OK (" + data.servicio + ", usuarios: " + data.usuarios + ")";
  } catch (e) {
    el.textContent = "ERROR: " + e.message;
  }
})();
