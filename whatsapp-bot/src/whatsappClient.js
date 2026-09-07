import axios from 'axios';
import https from 'https';
import { config } from './config.js';

const API_BASE = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`;
// Base "sin número" — los endpoints de media (/{media-id}) cuelgan del
// árbol general de la Graph API, no del phone_number_id.
const GRAPH_BASE = `https://graph.facebook.com/${config.whatsapp.apiVersion}`;

// httpsAgent con keepAlive:false — se probó como hipótesis (Meta respondía
// 500 en los envíos con keep-alive) pero NO resolvió el error. Se deja
// desactivado de todos modos (no hace daño) mientras se investiga la causa
// real; candidato a revertir si algún día estorba.
const client = axios.create({
  baseURL: API_BASE,
  headers: {
    Authorization: `Bearer ${config.whatsapp.token}`,
    'Content-Type': 'application/json',
  },
  httpsAgent: new https.Agent({ keepAlive: false }),
  timeout: 10_000,
});

// OJO — caso especial de México en WhatsApp Cloud API: el "wa_id"/"from" que
// llega en los webhooks de mensajes ENTRANTES para números mexicanos trae un
// "1" extra después del código de país (52), ej. "5215516479132" (13
// dígitos). Pero para ENVIAR un mensaje a ese mismo número, Graph API espera
// el formato SIN ese "1", ej. "525516479132" (12 dígitos). Si se le reenvía
// el wa_id tal cual, Meta responde con el error 131030 "Recipient phone
// number not in allowed list" — un mensaje engañoso, porque el número sí
// puede estar autorizado; simplemente no lo reconoce en ese formato. Esto es
// un comportamiento documentado de Meta específico de números móviles
// mexicanos, no un problema de configuración de la cuenta.
export function normalizeRecipient(to) {
  const digits = String(to || '').replace(/\D/g, '');
  if (digits.startsWith('521') && digits.length === 13) {
    return '52' + digits.slice(3);
  }
  return digits;
}

async function post(payload) {
  const body = payload.to ? { ...payload, to: normalizeRecipient(payload.to) } : payload;
  try {
    // Volvimos al header Authorization: Bearer (estándar documentado por
    // Meta). El intento anterior de mandar el token como query param
    // (?access_token=...) partía de una lectura incorrecta de lo que hace
    // Graph API Explorer — se confirmó directamente en el panel "Enviar
    // mensaje" del propio App Dashboard (Meta for Developers > Casos de
    // uso > Conectar en WhatsApp > Paso 2 > Enviar mensaje > pestaña
    // "Código") que el cURL que Meta genera para ESTA cuenta usa
    // exactamente 'Authorization: Bearer <token>' + body JSON crudo, no
    // query params ni form-data. Y de paso: ese mismo panel muestra la app
    // usando v25.0, mientras nosotros seguíamos en v21.0 (ver config.js).
    const { data } = await client.post('/messages', body);
    return data;
  } catch (err) {
    // Meta devuelve el detalle del error en err.response.data — es oro para
    // depurar (token vencido, número no verificado, plantilla mal armada, etc.)
    console.error('❌ Error enviando mensaje de WhatsApp:', err.response?.data || err.message);
    throw err;
  }
}

export function markAsRead(messageId) {
  return post({
    messaging_product: 'whatsapp',
    status: 'read',
    message_id: messageId,
  });
}

export function sendText(to, body) {
  return post({
    messaging_product: 'whatsapp',
    to,
    type: 'text',
    text: { body, preview_url: false },
  });
}

// --- Descarga de archivos que mandan los huéspedes (fotos, documentos) ---
//
// El webhook entrante solo trae un "id" de media, no el archivo en sí. Hay
// que resolverlo en dos pasos:
//   1. GET /{media-id} (con el token) -> devuelve una URL temporal (~5 min)
//      + mime_type.
//   2. GET esa URL (TAMBIÉN con el token — si no, Meta responde 401) ->
//      los bytes del archivo.
// Se usa desde conversationEngine.js para reenviar el archivo por correo a
// recepción (ver emailClient.js) en vez de perderlo como pasaba antes.
export async function downloadMedia(mediaId) {
  const { data: meta } = await axios.get(`${GRAPH_BASE}/${mediaId}`, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    timeout: 10_000,
  });
  const { data: rawBuffer } = await axios.get(meta.url, {
    headers: { Authorization: `Bearer ${config.whatsapp.token}` },
    responseType: 'arraybuffer',
    timeout: 20_000,
  });
  return {
    buffer: Buffer.from(rawBuffer),
    mimeType: meta.mime_type,
    fileSize: meta.file_size,
  };
}

// --- Alertas internas al staff/recepción ---
// Cómo se entera recepción de que alguien quiere reservar: el bot le manda
// un WhatsApp directo (texto libre) al número configurado en
// HOTEL_STAFF_WHATSAPP_NUMBER cada vez que un huésped pide hablar con un
// agente, confirma que quiere reservar, o pregunta por fechas sin
// disponibilidad.
//
// Limitación real a tener en cuenta: WhatsApp solo permite mensajes de
// texto libre (no plantilla) a un número que le haya escrito al bot en las
// últimas 24 horas ("ventana de servicio al cliente"). Para que estas
// alertas SIEMPRE lleguen sin importar cuánto tiempo pase, lo más simple es
// que el staff le mande un "hola" al número del bot una vez al día (o cada
// vez que abran turno) — eso mantiene la ventana abierta. La alternativa
// "a prueba de todo" es una plantilla de WhatsApp aprobada por Meta
// dedicada a estas alertas (no depende de la ventana de 24h), pero esa
// aprobación no es instantánea — buen candidato para fase 2.
//
// Nunca debe tronar el flujo del huésped si esto falla: por diseño,
// notifyStaff() atrapa sus propios errores y nunca los propaga.
let warnedMissingStaffNumber = false;

export async function notifyStaff(text) {
  const staffNumbers = config.hotel.staffNumbers;
  if (staffNumbers.length === 0) {
    if (!warnedMissingStaffNumber) {
      console.warn(
        '⚠️  HOTEL_STAFF_WHATSAPP_NUMBER no configurado — no se están mandando alertas internas de reservación/agente al staff.'
      );
      warnedMissingStaffNumber = true;
    }
    return;
  }
  // Se manda a todos en paralelo; si uno falla (ej. no le ha escrito al bot
  // en 24h) no debe tumbar el aviso a los demás.
  await Promise.all(
    staffNumbers.map((number) =>
      sendText(number, text).catch((err) => {
        console.error(`❌ No se pudo mandar la alerta interna a ${number}:`, err.response?.data || err.message);
      })
    )
  );
}

/**
 * sections: [{ title?, rows: [{ id, title, description? }] }]
 * Límites de WhatsApp: máx 10 filas en total, title ≤ 24 chars, description ≤ 72 chars.
 */
export function sendList(to, { header, body, footer, buttonText, sections }) {
  return post({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'list',
      ...(header ? { header: { type: 'text', text: header } } : {}),
      body: { text: body },
      ...(footer ? { footer: { text: footer } } : {}),
      action: {
        button: buttonText || 'Ver opciones',
        sections,
      },
    },
  });
}

/**
 * buttons: [{ id, title }] — máximo 3, title ≤ 20 chars.
 */
export function sendButtons(to, { body, buttons }) {
  return post({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: body },
      action: {
        buttons: buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })),
      },
    },
  });
}
