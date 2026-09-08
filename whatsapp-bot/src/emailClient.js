// Envío de correos a recepción: documentos que mandan los huéspedes por
// WhatsApp (Constancia de Situación Fiscal, recibos, etc.) y el registro de
// nuevas reservaciones.
//
// No hay ningún "sistema" de reservaciones más allá de esto — por decisión
// explícita del hotel (no hay PMS ni hoja de cálculo compartida todavía), el
// correo a recepción (junto con el aviso por WhatsApp de notifyStaff en
// whatsappClient.js) ES el registro. Recepción anota/gestiona desde ahí.
//
// Por qué API HTTP y no SMTP: Render bloquea los puertos SMTP (25/465/587)
// en el plan gratuito desde sept. 2025 — cualquier intento de conectar por
// SMTP directo (nodemailer, etc.) truena por timeout ahí. Brevo (antes
// Sendinblue) manda el correo por su API sobre HTTPS (puerto 443, sin
// bloquear), con un plan gratis de 300 correos/día — de sobra para esto.
//
// Requiere verificar BREVO_SENDER_EMAIL como "Single Sender" en Brevo
// (Settings → Senders → Add a sender, confirmar por el link que llega a ese
// correo). NO hace falta dominio propio del hotel para eso.
//
// Por diseño, nunca debe tronar el flujo del huésped si el correo falla —
// atrapa sus propios errores y nunca los propaga.
import axios from 'axios';
import { config } from './config.js';

const BREVO_ENDPOINT = 'https://api.brevo.com/v3/smtp/email';

let warnedMissingEmailConfig = false;

function isConfigured() {
  if (config.email.apiKey && config.email.senderEmail) return true;
  if (!warnedMissingEmailConfig) {
    console.warn(
      '⚠️  BREVO_API_KEY/BREVO_SENDER_EMAIL no configurados — no se están mandando correos a recepción (documentos ni reservaciones).'
    );
    warnedMissingEmailConfig = true;
  }
  return false;
}

async function sendMail({ subject, text, attachments }) {
  const to = config.email.receptionEmail;
  if (!to) return;
  if (!isConfigured()) return;

  const payload = {
    sender: { email: config.email.senderEmail, name: config.email.senderName },
    to: [{ email: to }],
    subject,
    textContent: text,
    ...(attachments
      ? {
          attachment: attachments.map((a) => ({
            name: a.filename,
            content: a.content.toString('base64'),
          })),
        }
      : {}),
  };

  try {
    await axios.post(BREVO_ENDPOINT, payload, {
      headers: {
        'api-key': config.email.apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      timeout: 15000,
    });
  } catch (err) {
    const detail = err.response?.data ? JSON.stringify(err.response.data) : err.message;
    console.error('❌ No se pudo mandar el correo a recepción:', detail);
  }
}

// --- Archivos que mandan los huéspedes (fotos, documentos) ---
//
// Antes estos mensajes se perdían por completo (el bot solo sabía leer
// texto). Ahora se reenvían tal cual a recepción por correo, con el archivo
// adjunto, para que nunca se pierda una Constancia de Situación Fiscal, un
// comprobante de pago, etc.
export async function sendGuestFileEmail({ phone, filename, mimeType, buffer, caption, kind }) {
  const kindLabel = kind === 'document' ? 'Documento' : 'Foto';
  const lines = [
    `${kindLabel} recibido por WhatsApp de un huésped.`,
    `Teléfono/WhatsApp: ${phone}`,
    `Fecha: ${new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}`,
  ];
  if (caption) lines.push(`Mensaje que acompañó el archivo: "${caption}"`);

  await sendMail({
    subject: `📎 ${kindLabel} de huésped por WhatsApp — ${phone}`,
    text: lines.join('\n'),
    attachments: [{ filename, content: buffer }],
  });
}

// --- Avisos generales a recepción (agente solicitado, grupo grande, sin
// disponibilidad, etc.) ---
//
// Mientras el hotel no tenga un teléfono fijo de recepción que reciba
// WhatsApp, el correo es el único canal que SIEMPRE existe — por eso
// staffAlerts.js manda estos avisos por aquí además de (o en vez de) por
// WhatsApp. Es el mismo texto que se le manda a notifyStaff(), solo que
// por correo.
export async function sendStaffAlertEmail(text) {
  await sendMail({
    subject: '🔔 Aviso del bot de WhatsApp — Hotel Posada Cocomacan',
    text,
  });
}

// --- Registro de nuevas reservaciones ---
//
// Se manda en cuanto el bot le confirma al huésped que su habitación quedó
// reservada (ver conversationEngine.js → handleAskName). Importante: el bot
// NO verifica disponibilidad real más allá de las fechas bloqueadas a mano
// en hotel-data.json (no hay inventario/ocupación por habitación) — por eso
// el correo le pide explícitamente a recepción que verifique antes de darla
// por buena.
export async function sendReservationEmail({
  guestName,
  phone,
  roomTypeName,
  guests,
  checkInLabel,
  checkOutLabel,
  nights,
  priceLine,
}) {
  const lines = [
    '🛎️ Nueva reservación confirmada por el bot de WhatsApp',
    '',
    `Nombre: ${guestName}`,
    `Teléfono/WhatsApp: ${phone}`,
    `Habitación: ${roomTypeName}`,
    `Huéspedes: ${guests}`,
    `Entrada: ${checkInLabel}`,
    `Salida: ${checkOutLabel}${nights ? ` (${nights} noche${nights === 1 ? '' : 's'})` : ''}`,
    `Total: ${priceLine}`,
    '',
    '⚠️ El bot ya le confirmó esta reservación al huésped. Verifica disponibilidad real cuanto antes y contáctalo para cerrar pago y detalles finales.',
  ];

  await sendMail({
    subject: `🛎️ Nueva reservación — ${guestName} (${checkInLabel} → ${checkOutLabel})`,
    text: lines.join('\n'),
  });
}
