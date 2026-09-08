import express from 'express';
import crypto from 'node:crypto';
import { config } from './config.js';
import { handleIncomingMessage } from './conversationEngine.js';
import { markAsRead } from './whatsappClient.js';

const app = express();

// Necesitamos el body crudo (rawBody) ANTES de que express lo parsee a JSON,
// porque la validación de firma de Meta se calcula sobre los bytes exactos
// que Meta envió.
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// --- Salud / sanity check ---
app.get('/', (_req, res) => {
  res.send('Hotel Posada Cocomacan · WhatsApp bot ✅');
});

// --- Verificación del webhook (Meta la llama UNA vez al configurar la URL) ---
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === config.whatsapp.verifyToken) {
    console.log('✅ Webhook verificado por Meta');
    return res.status(200).send(challenge);
  }
  console.warn('⚠️  Intento de verificación de webhook rechazado');
  return res.sendStatus(403);
});

// --- Validación de firma X-Hub-Signature-256 ---
function isValidSignature(req) {
  if (!config.whatsapp.appSecret) return true; // permite correr en dev sin app secret configurado
  const signatureHeader = req.get('X-Hub-Signature-256');
  if (!signatureHeader || !req.rawBody) return false;

  const expected =
    'sha256=' + crypto.createHmac('sha256', config.whatsapp.appSecret).update(req.rawBody).digest('hex');

  // timingSafeEqual requiere buffers del mismo largo
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// --- Recepción de mensajes ---
app.post('/webhook', (req, res) => {
  if (!isValidSignature(req)) {
    console.warn('⚠️  Firma de webhook inválida — posible request falsificado');
    return res.sendStatus(401);
  }

  // Respondemos 200 de inmediato: Meta reintenta agresivamente si tardamos
  // o si respondemos distinto a 200, y procesar (sobre todo la llamada a
  // Claude para FAQs) puede tomar un par de segundos.
  res.sendStatus(200);

  processWebhookPayload(req.body).catch((err) => {
    console.error('❌ Error procesando webhook:', err);
  });
});

async function processWebhookPayload(body) {
  const entries = body.entry || [];
  for (const entry of entries) {
    for (const change of entry.changes || []) {
      const value = change.value || {};
      const messages = value.messages || [];

      for (const message of messages) {
        const from = message.from; // wa_id del usuario, ya en formato E.164 sin '+'
        try {
          await markAsRead(message.id);
        } catch {
          // no crítico si falla el "visto" — seguimos con la respuesta
        }
        await handleIncomingMessage(from, message);
      }

      // value.statuses trae confirmaciones de entrega/lectura de NUESTROS
      // mensajes salientes — no requieren respuesta, las ignoramos.
    }
  }
}

app.listen(config.port, () => {
  console.log(`🏨 Bot de Hotel Posada Cocomacan escuchando en el puerto ${config.port}`);
});
