/**
 * GUI + controlador del cliente (PBI-3: registro y login).
 *
 * Habla con el servidor SOLO a través de Com (nunca fetch directo
 * a negocio ni acceso a datos). Sin reglas: muestra lo que la API dice.
 */
"use strict";

(function () {
  const Com = window.Com;
  const $ = (id) => document.getElementById(id);

  async function pintarEstado() {
    try {
      const data = await Com.health();
      $("estado").textContent = "OK (" + data.servicio + ", usuarios: " + data.usuarios + ")";
    } catch (e) {
      $("estado").textContent = "ERROR: " + e.message;
    }
  }

  function pintarSesion() {
    const sesion = Com.leerSesion();
    $("sesion").textContent = sesion
      ? sesion.usuario.email + " (" + sesion.usuario.estado + ")"
      : "sin sesión";
  }

  $("form-registro").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const creado = await Com.registro($("reg-email").value, $("reg-pass").value, $("reg-nombre").value);
      $("reg-msg").textContent = "Registrado como pendiente: " + creado.email + ". Activa tu cuenta para entrar.";
    } catch (e) {
      $("reg-msg").textContent = "ERROR: " + e.message;
    }
    pintarEstado();
  });

  $("form-login").addEventListener("submit", async (ev) => {
    ev.preventDefault();
    try {
      const sesion = await Com.login($("log-email").value, $("log-pass").value);
      $("log-msg").textContent = "Sesión iniciada: " + sesion.usuario.email;
    } catch (e) {
      $("log-msg").textContent = "ERROR: " + e.message;
    }
    pintarSesion();
    pintarEstado();
  });

  pintarEstado();
  pintarSesion();
})();
