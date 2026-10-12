/**
 * Adaptador OAuth de GitHub (PBI-8, flujo Authorization Code).
 *
 * Responsabilidad: hablar con GitHub (pedir token con el code y leer
 * el perfil + email verificado). No conoce reglas de negocio: devuelve
 * { email, nombre } y la API decide vía logica.loginExterno().
 * Sin credenciales no toca la red (configurado=false; la API da 501).
 * Secretos solo por entorno (ver .env.example). Sin dependencias: fetch.
 */
function crearOAuth(env = process.env) {
  const clientId = (env.GITHUB_CLIENT_ID || "").trim();
  const clientSecret = env.GITHUB_CLIENT_SECRET || "";
  const redirectUri = (env.GITHUB_CALLBACK_URL || "").trim();
  const configurado = !!(clientId && clientSecret && redirectUri);

  function urlAutorizacion() {
    const p = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      scope: "user:email",
    });
    return "https://github.com/login/oauth/authorize?" + p.toString();
  }

  async function postJson(url, cuerpo, token) {
    const cabeceras = { Accept: "application/json", "Content-Type": "application/json", "User-Agent": "procesos-2627" };
    if (token) {
      cabeceras.Authorization = "Bearer " + token;
    }
    const res = await fetch(url, { method: "POST", headers: cabeceras, body: JSON.stringify(cuerpo) });
    if (!res.ok) {
      throw new Error("github responde " + res.status);
    }
    return res.json();
  }

  async function getJson(url, token) {
    const res = await fetch(url, {
      headers: { Accept: "application/json", "User-Agent": "procesos-2627", Authorization: "Bearer " + token },
    });
    if (!res.ok) {
      throw new Error("github responde " + res.status);
    }
    return res.json();
  }

  // code -> access_token -> email verificado principal + nombre.
  async function intercambiarCodigo(code) {
    if (!code) {
      throw new Error("falta el código de autorización");
    }
    const datos = await postJson("https://github.com/login/oauth/access_token", {
      client_id: clientId,
      client_secret: clientSecret,
      code,
      redirect_uri: redirectUri,
    });
    if (datos.error || !datos.access_token) {
      throw new Error("código inválido o expirado");
    }
    const perfil = await getJson("https://api.github.com/user", datos.access_token);
    const emails = await getJson("https://api.github.com/user/emails", datos.access_token);
    const verificado = (emails || []).find((e) => e.verified && e.primary) || (emails || []).find((e) => e.verified);
    if (!verificado) {
      throw new Error("github no devolvió email verificado");
    }
    return { email: verificado.email, nombre: perfil.name || perfil.login || null };
  }

  return { configurado, urlAutorizacion, intercambiarCodigo };
}

module.exports = { crearOAuth };
