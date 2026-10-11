/**
 * GUI + controlador del cliente (PBI-4: sesión persistente y logout).
 *
 * Habla con el servidor SOLO a través de Com (nunca fetch directo
 * a negocio ni acceso a datos). Sin reglas: muestra lo que la API dice.
 * Al arrancar (incluido F5) revalida la sesión guardada con GET /me.
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
    const dentro = !!(sesion && sesion.token);
    $("sesion").textContent = dentro
      ? sesion.usuario.email + " (" + sesion.usuario.estado + ")"
      : "sin sesión";
    $("zona-sesion").hidden = !dentro;
    $("zona-registro").hidden = dentro;
    $("zona-login").hidden = dentro;
  }

  // Al cargar (también tras F5): si hay token guardado, se revalida
  // en el servidor; si está muerto, se limpia y se muestra "sin sesión".
  async function inicializar() {
    await pintarEstado();
    if (Com.leerSesion()) {
      try {
        await Com.me();
      } catch {
        // pedir() ya limpió la sesión ante el 401
      }
    }
    pintarSesion();
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

  $("btn-logout").addEventListener("click", async () => {
    await Com.logout();
    $("log-msg").textContent = "";
    pintarSesion();
  });

  inicializar();
})();
