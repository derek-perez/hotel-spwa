// Punto único para avisar a recepción de algo que necesita atención humana:
// alguien pidió agente, hay un grupo grande, preguntaron por fechas sin
// disponibilidad, etc.
//
// Manda la alerta por TODOS los canales configurados a la vez — hoy eso es
// WhatsApp (si hay HOTEL_STAFF_WHATSAPP_NUMBER, ej. el celular de turno de
// recepción) y correo (si hay SMTP_USER/RECEPTION_EMAIL configurado).
//
// Por qué los dos: mientras el hotel no tenga un teléfono fijo de
// recepción dedicado a esto, el correo es el único canal que SIEMPRE
// existe — así una alerta nunca se pierde solo porque HOTEL_STAFF_WHATSAPP_NUMBER
// esté vacío (o, como pasó al lanzar esto, apuntando por error al celular
// personal de alguien del equipo en vez de a recepción).
import { notifyStaff } from './whatsappClient.js';
import { sendStaffAlertEmail } from './emailClient.js';

export async function alertStaff(text) {
  await Promise.all([notifyStaff(text), sendStaffAlertEmail(text)]);
}
