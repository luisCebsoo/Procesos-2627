/**
 * Script de utilidad para comprobar la conexión SMTP configurada en .env
 * Uso: node scripts/probar-smtp.js [email_destino_opcional]
 */
require("dotenv").config();
const nodemailer = require("nodemailer");

async function main() {
  const host = (process.env.SMTP_HOST || "").trim();
  const port = Number(process.env.SMTP_PORT) || 587;
  const user = (process.env.SMTP_USER || "").trim();
  const pass = process.env.SMTP_PASS || "";
  const from = (process.env.SMTP_FROM || user).trim();

  console.log("=== COMPROBACIÓN DE CONFIGURACIÓN SMTP ===");
  console.log({
    SMTP_HOST: host || "(vacío - sin configurar)",
    SMTP_PORT: port,
    SMTP_USER: user ? `${user.substring(0, 3)}...` : "(vacío - sin configurar)",
    SMTP_PASS: pass ? "********" : "(vacío - sin configurar)",
    SMTP_FROM: from || "(vacío - sin configurar)",
    APP_URL: process.env.APP_URL || "http://localhost:3000",
  });

  if (!host || !user || !pass || !from) {
    console.error("\n❌ Faltan variables SMTP en tu archivo .env.");
    console.error("Asegúrate de definir SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS y SMTP_FROM.");
    process.exit(1);
  }

  const transporte = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });

  console.log("\n⏳ Verificando conexión con el servidor SMTP...");
  try {
    await transporte.verify();
    console.log("✅ Conexión SMTP verificada con éxito.");
  } catch (err) {
    console.error("❌ Error de conexión/autenticación con el servidor SMTP:", err.message);
    process.exit(1);
  }

  const destino = process.argv[2];
  if (destino) {
    console.log(`\n⏳ Enviando correo de prueba a ${destino}...`);
    try {
      const info = await transporte.sendMail({
        from,
        to: destino,
        subject: "Prueba SMTP - Procesos-2627",
        text: "¡El envío de correo SMTP funciona correctamente!",
        html: "<p><strong>¡Enhorabuena!</strong> El envío de correo SMTP en Procesos-2627 está 100% operativo.</p>",
      });
      console.log("✅ Correo de prueba enviado con éxito! ID:", info.messageId);
    } catch (err) {
      console.error("❌ Error al enviar el correo de prueba:", err.message);
      process.exit(1);
    }
  } else {
    console.log("\n💡 Para enviar un correo de prueba real, ejecuta:");
    console.log("   node scripts/probar-smtp.js tu_correo@ejemplo.com");
  }
}

main();
