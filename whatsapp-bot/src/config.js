import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    // No tronamos el proceso en import time por si alguien corre un script
    // aislado (p.ej. pruebas), pero sí dejamos evidencia clara en consola.
    console.warn(`⚠️  Falta la variable de entorno ${name} (revisa tu .env)`);
  }
  return value;
}

export const config = {
  whatsapp: {
    token: required('WHATSAPP_TOKEN'),
    phoneNumberId: required('WHATSAPP_PHONE_NUMBER_ID'),
    verifyToken: required('WHATSAPP_VERIFY_TOKEN'),
    appSecret: required('WHATSAPP_APP_SECRET'),
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v21.0',
  },
  hotel: {
    contactNumber: process.env.HOTEL_WHATSAPP_NUMBER || '524183357375',
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  },
  port: Number(process.env.PORT) || 3000,
};
