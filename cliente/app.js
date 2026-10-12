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
    const admin = dentro && sesion.usuario.rol === "admin";
    $("sesion").textContent = dentro
      ? sesion.usuario.email + " (" + sesion.usuario.rol + "/" + sesion.usuario.estado + ")"
      : "sin sesión";
    $("zona-sesion").hidden = !dentro;
    $("zona-registro").hidden = dentro;
    $("zona-login").hidden = dentro;
    $("zona-admin").hidden = !admin;
    $("zona-cuenta").hidden = !dentro;
    if (admin) {
      pintarUsuarios();
    }
  }

  // Panel admin: pide la lista al servidor (él decide si tienes permiso).
  async function pintarUsuarios() {
    try {
      const lista = await Com.listarUsuarios();
      $("lista-usuarios").innerHTML = "";
      for (const u of lista) {
        const li = document.createElement("li");
        li.textContent = u.email + " (" + u.rol + "/" + u.estado + ") ";
        const btn = document.createElement("button");
        btn.textContent = "Borrar";
        btn.addEventListener("click", async () => {
          try {
            await Com.borrarUsuario(u.email);
            $("admin-msg").textContent = "Borrado: " + u.email;
          } catch (e) {
            $("admin-msg").textContent = "ERROR: " + e.message;
          }
          pintarUsuarios();
          pintarEstado();
        });
        li.appendChild(btn);
        $("lista-usuarios").appendChild(li);
      }
      $("admin-msg").textContent = "";
    } catch (e) {
      $("admin-msg").textContent = "ERROR: " + e.message;
    }
  }

  // Al cargar (también tras F5): primero recoge el token si venimos
  // del callback OAuth (?token=), limpia la URL y luego revalida
  // la sesión guardada como siempre.
  async function inicializar() {
    await pintarEstado();
    const params = new URLSearchParams(window.location.search);
    if (params.get("oauth_error")) {
      $("log-msg").textContent = "ERROR con GitHub: " + params.get("oauth_error");
    }
    if (params.get("token")) {
      Com.guardarSesion({ token: params.get("token"), usuario: { email: params.get("email") || "", rol: "usuario", estado: "activo" } });
      window.history.replaceState({}, "", window.location.pathname);
    }
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

  // Borrar mi propia cuenta (permitido a cualquier usuario; el servidor
  // impide borrar la de otro salvo admin).
  $("btn-borrar-cuenta").addEventListener("click", async () => {
    const sesion = Com.leerSesion();
    if (!sesion) {
      return;
    }
    try {
      await Com.borrarUsuario(sesion.usuario.email);
      Com.limpiarSesion();
      $("cuenta-msg").textContent = "Cuenta eliminada.";
    } catch (e) {
      $("cuenta-msg").textContent = "ERROR: " + e.message;
    }
    pintarSesion();
    pintarEstado();
  });

  inicializar();
})();
