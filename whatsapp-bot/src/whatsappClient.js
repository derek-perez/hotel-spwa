import axios from 'axios';
import { config } from './config.js';

const API_BASE = `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}`;

const client = axios.create({
  baseURL: API_BASE,
  headers: {
    Authorization: `Bearer ${config.whatsapp.token}`,
    'Content-Type': 'application/json',
  },
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
