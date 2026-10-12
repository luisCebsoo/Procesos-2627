/**
 * Controlador de la página de activación (PBI-7).
 *
 * Lee ?token= de la URL y lo canjea SOLO a través de Com.
 * Sin reglas: muestra lo que la API dice (activo o enlace inválido).
 */
"use strict";

(async function () {
  const el = document.getElementById("verificar-msg");
  const token = new URLSearchParams(window.location.search).get("token");
  if (!token) {
    el.textContent = "ERROR: este enlace no trae token.";
    return;
  }
  try {
    const usuario = await window.Com.verificar(token);
    el.textContent = "¡Cuenta activada! Ya puedes entrar: " + usuario.email;
  } catch (e) {
    el.textContent = "ERROR: " + e.message + " (pide un nuevo enlace registrándote o con reenviar).";
  }
})();
