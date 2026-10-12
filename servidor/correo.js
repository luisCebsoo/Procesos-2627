/**
 * Adaptador de correo transaccional (PBI-7).
 *
 * Responsabilidad: enviar el email de verificación. No conoce reglas
 * de negocio: recibe destino + enlace ya construidos por la API.
 * Funciona con cualquier proveedor SMTP (Brevo, SendGrid, Mailgun…)
 * solo con variables de entorno. Sin SMTP configurado no toca la red:
 * registra el enlace en el log (modo desarrollo/CI) y avisa de que es
 * simulado. Los secretos jamás están en código (ver .env.example).
 */
function crearCorreo(env = process.env) {
  const host = (env.SMTP_HOST || "").trim();
  const port = Number(env.SMTP_PORT) || 587;
  const user = (env.SMTP_USER || "").trim();
  const pass = env.SMTP_PASS || "";
  const from = (env.SMTP_FROM || user).trim();
  const configurado = !!(host && user && pass && from);

  async function enviarEnlace(destino, enlace) {
    if (!configurado) {
      console.log(JSON.stringify({ level: "info", msg: "email simulado (sin SMTP)", destino, enlace }));
      return { simulado: true, destino, enlace };
    }
    // Carga perezosa: sin SMTP no se necesita el paquete para nada.
    const nodemailer = require("nodemailer");
    const transporte = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
    await transporte.sendMail({
      from,
      to: destino,
      subject: "Activa tu cuenta en Procesos-2627",
      text: `Pulsa este enlace para activar tu cuenta: ${enlace}`,
      html: `<p>Pulsa este enlace para activar tu cuenta:</p><p><a href="${enlace}">${enlace}</a></p>`,
    });
    console.log(JSON.stringify({ level: "info", msg: "email de verificación enviado", destino }));
    return { simulado: false, destino };
  }

  return { enviarEnlace, configurado };
}

module.exports = { crearCorreo };
