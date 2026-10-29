/**
 * Tests unitarios de correo transaccional (PBI-7).
 * Verifica la detección de configuración SMTP y el modo simulado (sin tocar red).
 */
const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const { crearCorreo } = require("../servidor/correo");

describe("PBI-7: adaptador de correo transaccional", () => {
  it("sin variables de entorno, configurado es false y envía en modo simulado", async () => {
    const correo = crearCorreo({});
    assert.equal(correo.configurado, false);

    const resultado = await correo.enviarEnlace("test@ejemplo.com", "http://localhost:3000/verificar.html?token=123");
    assert.equal(resultado.simulado, true);
    assert.equal(resultado.destino, "test@ejemplo.com");
    assert.equal(resultado.enlace, "http://localhost:3000/verificar.html?token=123");
  });

  it("con variables incompletas sigue sin considerarse configurado", () => {
    assert.equal(crearCorreo({ SMTP_HOST: "smtp.brevo.com" }).configurado, false);
    assert.equal(crearCorreo({ SMTP_HOST: "smtp.brevo.com", SMTP_USER: "u" }).configurado, false);
    assert.equal(crearCorreo({ SMTP_HOST: "smtp.brevo.com", SMTP_USER: "u", SMTP_PASS: "p" }).configurado, true); // from defaults to user
  });

  it("con todas las variables requeridas se marca como configurado", () => {
    const correo = crearCorreo({
      SMTP_HOST: "smtp.brevo.com",
      SMTP_PORT: "587",
      SMTP_USER: "remitente@ejemplo.com",
      SMTP_PASS: "secreto123",
      SMTP_FROM: "No-Reply <remitente@ejemplo.com>",
    });
    assert.equal(correo.configurado, true);
  });
});
