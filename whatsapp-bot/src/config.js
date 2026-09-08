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
    // v25.0: es la versión que el propio App Dashboard de Meta usa hoy para
    // generar su cURL de ejemplo para esta cuenta (antes estaba en v21.0,
    // sin relación probada con el bug, pero es una variable nunca antes
    // probada y es gratis alinearla con lo que Meta mismo recomienda ahora).
    apiVersion: process.env.WHATSAPP_API_VERSION || 'v25.0',
  },
  hotel: {
    contactNumber: process.env.HOTEL_WHATSAPP_NUMBER || '524183357375',
    // Número(s) de WhatsApp donde el bot avisa al staff/recepción cuando
    // alguien quiere reservar, pide un agente, o pregunta por fechas sin
    // disponibilidad. Admite uno o varios separados por coma (ej. recepción
    // + gerente): "524XXXXXXXXX,524YYYYYYYYY". Opcional: si se deja vacío,
    // el bot sigue funcionando normal para el huésped, solo no manda esas
    // alertas internas (se avisa una vez en los logs).
    //
    // Recomendación operativa: en vez de usar el celular personal de cada
    // recepcionista, usa un solo número "de mostrador" compartido entre
    // turnos — así no importa quién esté trabajando ese día. Si de plano
    // quieren que le llegue a varias personas específicas, aquí sí se puede.
    staffNumbers: (process.env.HOTEL_STAFF_WHATSAPP_NUMBER || '')
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean),
  },
  // Correo de recepción: a dónde llegan (a) los documentos/fotos que mandan
  // los huéspedes por WhatsApp (Constancia de Situación Fiscal, recibos,
  // etc. — antes se perdían) y (b) el registro de cada nueva reservación
  // confirmada por el bot. No hay PMS ni hoja de cálculo todavía — este
  // correo (junto con el WhatsApp interno de notifyStaff) ES el sistema.
  //
  // Configurado para el correo de Yahoo del hotel: smtp.mail.yahoo.com,
  // puerto 465 (SSL). SMTP_PASS debe ser una "contraseña de aplicación"
  // generada en la configuración de seguridad de la cuenta de Yahoo — NO la
  // contraseña normal de la cuenta (Yahoo no la acepta para SMTP de
  // terceros).
  email: {
    host: process.env.SMTP_HOST || 'smtp.mail.yahoo.com',
    port: Number(process.env.SMTP_PORT) || 465,
    secure: process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : true,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    // Por defecto llega al mismo buzón que manda el correo (un solo correo
    // compartido para el hotel). Si algún día quieren separarlo, basta con
    // fijar RECEPTION_EMAIL a otra dirección.
    receptionEmail: process.env.RECEPTION_EMAIL || process.env.SMTP_USER,
  },
  anthropic: {
    apiKey: required('ANTHROPIC_API_KEY'),
    model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6',
  },
  port: Number(process.env.PORT) || 3000,
};
