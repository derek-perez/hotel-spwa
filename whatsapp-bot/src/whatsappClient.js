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

async function post(payload) {
  try {
    const { data } = await client.post('/messages', payload);
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
