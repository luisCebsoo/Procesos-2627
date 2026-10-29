/**
 * Adaptador de correo transaccional (PBI-7).
 *
 * Responsabilidad: enviar el email de verificación. No conoce reglas
 * de negocio: recibe destino + enlace ya construidos por la API.
 * Funciona con cualquier proveedor SMTP (Brevo, SendGrid, Mailgun, Gmail…)
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
      text: `¡Bienvenido a Procesos-2627!\n\nPor favor, activa tu cuenta pulsando el siguiente enlace:\n${enlace}\n\nSi no has creado esta cuenta, puedes ignorar este mensaje.`,
      html: `
        <div style="font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 8px;">
          <h2 style="color: #2b6cb0; margin-top: 0;">Activa tu cuenta en Procesos-2627</h2>
          <p>¡Gracias por registrarte! Para completar tu registro y verificar tu dirección de correo electrónico, haz clic en el siguiente enlace:</p>
          <p style="text-align: center; margin: 30px 0;">
            <a href="${enlace}" style="background-color: #3182ce; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Activar mi cuenta</a>
          </p>
          <p style="font-size: 13px; color: #718096;">Si el botón no funciona, copia y pega el siguiente enlace directamente en tu navegador:</p>
          <p style="font-size: 13px; word-break: break-all;"><a href="${enlace}" style="color: #3182ce;">${enlace}</a></p>
          <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 20px 0;" />
          <p style="font-size: 12px; color: #a0aec0;">Si tú no has solicitado este registro, puedes ignorar este mensaje de forma segura.</p>
        </div>
      `,
    });
    console.log(JSON.stringify({ level: "info", msg: "email de verificación enviado", destino }));
    return { simulado: false, destino };
  }

  return { enviarEnlace, configurado };
}

module.exports = { crearCorreo };
