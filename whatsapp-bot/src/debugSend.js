// ⚠️ TEMPORAL — solo para diagnóstico del bug de envío. Borrar este archivo
// y su ruta en server.js en cuanto se resuelva o se descarte esta pista.
//
// Objetivo: aislar si el problema está en axios específicamente, o en
// cualquier request HTTP hecha desde el entorno/IP de Render — sin
// necesitar la Shell de pago de Render. Para eso mandamos el MISMO mensaje
// por 2 vías distintas, ambas corriendo en el mismo proceso/servidor de
// Render (misma IP de salida):
//
//   A) https nativo de Node (sin axios) — lo más parecido a un curl puro
//      que se puede hacer sin Shell.
//   B) axios con una instancia 100% default (sin baseURL, sin httpsAgent
//      custom, sin nada que hayamos tocado) — para descartar que algo de
//      NUESTRA configuración de axios (no axios en sí) sea la causa.
//
// Si A y/o B SÍ entregan el mensaje a WhatsApp, mientras que el flujo normal
// del bot (whatsappClient.js con axios "de producción") sigue fallando,
// aislamos el problema a algo específico de cómo armamos esa instancia de
// axios. Si A y B TAMBIÉN fallan igual, el problema es la IP/entorno de
// Render en sí, sin importar el cliente HTTP.

import https from 'https';
import axios from 'axios';
import { config } from './config.js';

function sendWithNativeHttps(to, bodyText) {
  return new Promise((resolve) => {
    const payload = JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: bodyText },
    });

    const req = https.request(
      {
        hostname: 'graph.facebook.com',
        path: `/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`,
        method: 'POST',
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
        timeout: 10_000,
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => (raw += chunk));
        res.on('end', () => {
          resolve({ variant: 'native-https', status: res.statusCode, body: safeJson(raw) });
        });
      }
    );

    req.on('error', (err) => {
      resolve({ variant: 'native-https', error: err.message });
    });
    req.on('timeout', () => {
      req.destroy();
      resolve({ variant: 'native-https', error: 'timeout' });
    });

    req.write(payload);
    req.end();
  });
}

async function sendWithPlainAxios(to, bodyText) {
  // Instancia de axios totalmente nueva y default — sin baseURL, sin
  // httpsAgent custom, sin nada heredado de whatsappClient.js.
  try {
    const { data, status } = await axios.post(
      `https://graph.facebook.com/${config.whatsapp.apiVersion}/${config.whatsapp.phoneNumberId}/messages`,
      {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: bodyText },
      },
      {
        headers: {
          Authorization: `Bearer ${config.whatsapp.token}`,
          'Content-Type': 'application/json',
        },
        timeout: 10_000,
      }
    );
    return { variant: 'plain-axios', status, body: data };
  } catch (err) {
    return {
      variant: 'plain-axios',
      status: err.response?.status,
      body: err.response?.data,
      error: !err.response ? err.message : undefined,
    };
  }
}

function safeJson(raw) {
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

export async function runDebugSend(to) {
  const [nativeResult, axiosResult] = await Promise.all([
    sendWithNativeHttps(to, '🧪 prueba A: https nativo de Node (sin axios)'),
    sendWithPlainAxios(to, '🧪 prueba B: axios default (sin config custom)'),
  ]);
  return { nativeResult, axiosResult };
}
