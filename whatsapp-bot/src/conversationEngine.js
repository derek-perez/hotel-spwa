import { getSession, saveSession, resetSession, STATES } from './sessionStore.js';
import { listRoomTypes, findRoomType } from './hotelData.js';
import { computeQuote, guestsFitRoom, getCapacityRange, getOverallMaxCapacity } from './quoteEngine.js';
import { parseFlexibleDate, isTodayOrFuture, isAfter, formatDateEs } from './dateUtils.js';
import { answerFaq } from './faqEngine.js';
import { sendText, sendList, sendButtons, notifyStaff } from './whatsappClient.js';

// ---------- helpers de texto ----------

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function normalize(text) {
  return stripAccents(String(text || '').trim().toLowerCase());
}

function money(n) {
  return `$${n.toLocaleString('es-MX')} MXN`;
}

// ---------- mensaje pre-armado que manda el sitio web ----------
//
// El botón "Consultar disponibilidad" del sitio (script.js → buildWhatsAppLink)
// abre WhatsApp con un texto ya formateado tipo:
//
//   ¡Hola! Me gustaría consultar disponibilidad en Hotel Posada Cocomacan.
//   📅 Entrada: 14 de septiembre de 2026
//   📅 Salida: 16 de septiembre de 2026
//   🛏 Habitación / Huéspedes: Habitación Doble — 4 huéspedes
//   ¿Tienen espacio disponible para estas fechas?
//
// Antes esto caía directo en answerFaq() (texto libre sin pasar por el
// menú) — Claude no lo entendía como una cotización estructurada y el
// huésped terminaba teniendo que repetir todo a mano. Esto lo detecta y
// arranca la cotización con lo que ya trae, en vez de tratarlo como una
// pregunta cualquiera.
export function parseWebsiteQuoteMessage(text) {
  if (!text) return null;
  const entrada = text.match(/entrada:\s*([^\n]+)/i);
  const salida = text.match(/salida:\s*([^\n]+)/i);
  const habitacion = text.match(/habitaci[oó]n\s*\/\s*hu[eé]spedes:\s*([^\n]+)/i);
  // Exigimos las tres etiquetas juntas para no disparar con un mensaje
  // libre que solo mencione "entrada" o "salida" de pasada.
  if (!entrada || !salida || !habitacion) return null;
  return {
    checkinRaw: entrada[1].trim(),
    checkoutRaw: salida[1].trim(),
    roomOrGuestsRaw: habitacion[1].trim(),
  };
}

export function extractGuestsFromLabel(label) {
  const match = label.match(/(\d+)\s*hu[eé]sped/i);
  return match ? parseInt(match[1], 10) : null;
}

export function extractRoomTypeFromLabel(label) {
  const normalizedLabel = normalize(label);
  return listRoomTypes().find((r) => normalizedLabel.includes(normalize(r.name))) || null;
}

// Comandos globales: funcionan sin importar en qué paso del flujo esté el usuario.
function detectGlobalCommand(normalizedText) {
  if (['menu', 'menú', 'inicio', 'hola'].includes(normalizedText)) return 'MENU';
  if (['cotizar', 'cotizacion', 'cotización', 'precio', 'precios', 'tarifas'].includes(normalizedText)) return 'QUOTE';
  if (['agente', 'humano', 'persona', 'recepcion', 'recepción'].includes(normalizedText)) return 'AGENT';
  return null;
}

// ---------- mensajes / prompts de cada paso ----------

async function sendMainMenu(to) {
  await sendList(to, {
    body: '¡Hola! 👋 Soy el asistente virtual de *Hotel Posada Cocomacan*. ¿En qué te ayudo?',
    buttonText: 'Ver opciones',
    sections: [
      {
        rows: [
          { id: 'menu_cotizar', title: 'Cotizar mi estancia', description: 'Precio según fechas y huéspedes' },
          { id: 'menu_faq', title: 'Preguntas frecuentes', description: 'Amenidades, ubicación, políticas' },
          { id: 'menu_agente', title: 'Hablar con el hotel', description: 'Un miembro del equipo te contesta' },
        ],
      },
    ],
  });
}

async function sendRoomTypeList(to) {
  const rooms = listRoomTypes();
  await sendList(to, {
    body: 'Perfecto, empecemos tu cotización. ¿Qué tipo de habitación te interesa?',
    buttonText: 'Elegir habitación',
    sections: [
      {
        rows: rooms.map((r) => ({
          id: `room_${r.id}`,
          title: r.name.slice(0, 24),
          description: `${r.capacity} · ${r.beds}`.slice(0, 72),
        })),
      },
    ],
  });
}

async function sendAskGuests(to, roomType) {
  const { min, max } = getCapacityRange(roomType);
  const rangeText = min === max ? `${min}` : `${min} a ${max}`;
  await sendText(to, `¿Para cuántas personas sería? (${rangeText} huéspedes en ${roomType.name}). Solo escribe el número.`);
}

async function sendAskCheckIn(to) {
  await sendText(
    to,
    'Perfecto. ¿Cuál sería tu fecha de *entrada*?\nPuedes escribirla como día/mes/año (ej. 14/09/2026), como "14 de septiembre de 2026", o simplemente "hoy" / "mañana".'
  );
}

async function sendAskCheckOut(to) {
  await sendText(to, '¿Y tu fecha de *salida*? (mismo formato, ej. 16/09/2026 o "16 de septiembre de 2026")');
}

async function sendQuoteSummary(to, session) {
  const { roomTypeId, guests, checkIn, checkOut } = session.data;
  const result = computeQuote({ roomTypeId, guests, checkIn: new Date(checkIn), checkOut: new Date(checkOut) });

  const checkInLabel = formatDateEs(new Date(checkIn));
  const checkOutLabel = formatDateEs(new Date(checkOut));

  if (!result.ok && result.reason === 'no_availability') {
    await sendText(
      to,
      `Justo para esas fechas (${checkInLabel} → ${checkOutLabel}) ya no tenemos disponibilidad 😕. Si gustas, escribe *agente* y el equipo del hotel te confirma fechas cercanas u otras opciones, o escribe *cotizar* para intentar con otras fechas.`
    );
    await notifyStaff(
      `📅 Alguien preguntó por ${result.roomType.name} del ${checkInLabel} al ${checkOutLabel} — fechas marcadas SIN disponibilidad. Cliente: ${to}. Puede valer la pena ofrecerle alternativas directamente.`
    );
    resetSession(to);
    return;
  }

  if (!result.ok) {
    // No debería pasar si validamos bien en cada paso, pero por si acaso:
    await sendText(to, 'Algo no cuadró con esos datos 🤔. Vamos a intentarlo de nuevo.');
    session.state = STATES.ASK_ROOM_TYPE;
    saveSession(to, session);
    await sendRoomTypeList(to);
    return;
  }

  if (result.needsManualQuote) {
    await sendText(
      to,
      `*${result.roomType.name}*\n${guests} huésped(es) · ${checkInLabel} → ${checkOutLabel} (${result.nights} noche${result.nights === 1 ? '' : 's'})\n\nEsta habitación es bajo cotización especial. Un miembro del equipo te dará el precio exacto por este mismo chat en breve.`
    );
  } else {
    await sendText(
      to,
      `*Cotización — ${result.roomType.name}*\n${guests} huésped(es) · ${checkInLabel} → ${checkOutLabel}\n${result.nights} noche${result.nights === 1 ? '' : 's'} × ${money(result.pricePerNight)} = *${money(result.total)}*\n\nCheck-in 1:00 PM · Check-out 12:00 PM.`
    );
  }

  session.state = STATES.CONFIRM_SUMMARY;
  saveSession(to, session);

  await sendButtons(to, {
    body: '¿Cómo quieres continuar?',
    buttons: [
      { id: 'confirm_reservar', title: 'Quiero reservar' },
      { id: 'confirm_otra', title: 'Ver otra opción' },
      { id: 'confirm_menu', title: 'Menú principal' },
    ],
  });
}

// ---------- manejo de comandos globales ----------

async function handleGlobalCommand(to, command, session) {
  if (command === 'MENU') {
    const fresh = resetSession(to);
    saveSession(to, fresh);
    await sendMainMenu(to);
    return true;
  }
  if (command === 'QUOTE') {
    session.state = STATES.ASK_ROOM_TYPE;
    session.data = {};
    saveSession(to, session);
    await sendRoomTypeList(to);
    return true;
  }
  if (command === 'AGENT') {
    await sendText(
      to,
      'Listo, un miembro del equipo de Hotel Posada Cocomacan revisará este chat y te contestará en breve. 🙌'
    );
    await notifyStaff(`🙋 ${to} pidió hablar con un agente del hotel por WhatsApp.`);
    resetSession(to);
    return true;
  }
  return false;
}

// ---------- máquina de estados principal ----------

export async function handleIncomingMessage(to, message) {
  const session = getSession(to);

  // Extraemos texto plano sea cual sea el tipo de mensaje entrante.
  let text = null;
  let interactiveId = null;

  if (message.type === 'text') {
    text = message.text.body;
  } else if (message.type === 'interactive') {
    const interactive = message.interactive;
    if (interactive.type === 'list_reply') {
      interactiveId = interactive.list_reply.id;
      text = interactive.list_reply.title;
    } else if (interactive.type === 'button_reply') {
      interactiveId = interactive.button_reply.id;
      text = interactive.button_reply.title;
    }
  } else {
    // audio, imagen, sticker, ubicación, etc. — no soportado en v1.
    await sendText(to, 'Por ahora solo puedo leer mensajes de texto o los botones del menú 🙂. Escribe *menú* para empezar.');
    return;
  }

  const normalized = normalize(text);

  // Comandos globales tienen prioridad, EXCEPTO cuando el usuario está
  // contestando con un id de botón/lista propio del flujo (esos ya se
  // manejan explícitamente en cada estado).
  if (!interactiveId) {
    const globalCommand = detectGlobalCommand(normalized);
    if (globalCommand && (await handleGlobalCommand(to, globalCommand, session))) return;
  }

  switch (session.state) {
    case STATES.MAIN_MENU:
      return handleMainMenu(to, session, { interactiveId, text, normalized });
    case STATES.ASK_ROOM_TYPE:
      return handleAskRoomType(to, session, { interactiveId, text, normalized });
    case STATES.ASK_GUESTS:
      return handleAskGuests(to, session, { text, normalized });
    case STATES.ASK_CHECKIN:
      return handleAskCheckIn(to, session, { text });
    case STATES.ASK_CHECKOUT:
      return handleAskCheckOut(to, session, { text });
    case STATES.CONFIRM_SUMMARY:
      return handleConfirmSummary(to, session, { interactiveId });
    case STATES.FAQ_MODE:
      return handleFaqMode(to, session, { text });
    default:
      resetSession(to);
      return sendMainMenu(to);
  }
}

async function handleMainMenu(to, session, { interactiveId, text, normalized }) {
  if (interactiveId === 'menu_cotizar') {
    session.state = STATES.ASK_ROOM_TYPE;
    saveSession(to, session);
    return sendRoomTypeList(to);
  }
  if (interactiveId === 'menu_faq') {
    session.state = STATES.FAQ_MODE;
    saveSession(to, session);
    return sendText(to, 'Claro, pregúntame lo que quieras sobre el hotel (habitaciones, ubicación, amenidades, políticas...).');
  }
  if (interactiveId === 'menu_agente') {
    await sendText(to, 'Listo, un miembro del equipo del hotel te contestará por este mismo chat en breve. 🙌');
    await notifyStaff(`🙋 ${to} pidió hablar con un agente del hotel por WhatsApp.`);
    resetSession(to);
    return;
  }

  // ¿Es el mensaje pre-armado del botón "Consultar disponibilidad" del
  // sitio? Si sí, arrancamos la cotización con esos datos en vez de
  // tratarlo como pregunta libre.
  const websiteQuote = parseWebsiteQuoteMessage(text);
  if (websiteQuote) {
    return handleWebsiteQuoteMessage(to, session, websiteQuote);
  }

  // Texto libre sin pasar por el menú: lo tratamos como pregunta (mejor UX
  // que insistir "no entendí, usa el menú").
  const reply = await answerFaq(text);
  return sendText(to, reply);
}

async function handleWebsiteQuoteMessage(to, session, { checkinRaw, checkoutRaw, roomOrGuestsRaw }) {
  const checkIn = parseFlexibleDate(checkinRaw);
  const checkOut = parseFlexibleDate(checkoutRaw);
  const guests = extractGuestsFromLabel(roomOrGuestsRaw);
  const roomType = extractRoomTypeFromLabel(roomOrGuestsRaw);
  const hasValidDates = Boolean(checkIn && checkOut && isTodayOrFuture(checkIn) && isAfter(checkOut, checkIn));

  session.data = {};

  // Caso ideal: trae fechas válidas + habitación reconocida + huéspedes que
  // sí caben ahí -> cotización inmediata, cero preguntas de vuelta.
  if (roomType && hasValidDates && guests && guestsFitRoom(roomType, guests)) {
    session.data.roomTypeId = roomType.id;
    session.data.guests = guests;
    session.data.checkIn = checkIn.toISOString();
    session.data.checkOut = checkOut.toISOString();
    saveSession(to, session);
    await sendText(to, '¡Hola! 👋 Vi tu solicitud desde nuestro sitio — aquí tienes tu cotización al toque:');
    return sendQuoteSummary(to, session);
  }

  // Reconocimos la habitación pero falta algo (fechas inválidas/vacías, o
  // el número de huéspedes no cabe en esa habitación): saltamos directo a
  // pedir huéspedes, no hace falta que elija la habitación de nuevo.
  if (roomType) {
    session.data.roomTypeId = roomType.id;
    session.state = STATES.ASK_GUESTS;
    saveSession(to, session);
    await sendText(to, `¡Hola! 👋 Vi tu solicitud desde nuestro sitio para *${roomType.name}*. Nada más confírmame un dato:`);
    return sendAskGuests(to, roomType);
  }

  // No se pudo identificar la habitación (p.ej. "sin preferencia de
  // habitación", o vino del botón flotante genérico con "Por definir" en
  // todo): arrancamos la cotización guiada normal, pero con un saludo que
  // reconoce de dónde viene, no un "no entendí".
  session.state = STATES.ASK_ROOM_TYPE;
  saveSession(to, session);
  await sendText(to, '¡Hola! 👋 Vi tu solicitud desde nuestro sitio. Vamos a armar tu cotización — dime qué habitación te interesa:');
  return sendRoomTypeList(to);
}

async function handleAskRoomType(to, session, { interactiveId, normalized }) {
  let roomType = null;

  if (interactiveId && interactiveId.startsWith('room_')) {
    roomType = findRoomType(interactiveId.replace('room_', ''));
  } else {
    // fallback: intenta encontrar el room type por coincidencia de nombre en texto libre
    roomType = listRoomTypes().find((r) => normalize(r.name).includes(normalized) || normalized.includes(normalize(r.name)));
  }

  if (!roomType) {
    await sendText(to, 'No reconocí esa habitación 🤔. Elige una de la lista, por favor:');
    return sendRoomTypeList(to);
  }

  session.data.roomTypeId = roomType.id;
  session.state = STATES.ASK_GUESTS;
  saveSession(to, session);
  return sendAskGuests(to, roomType);
}

async function handleAskGuests(to, session, { normalized }) {
  const guests = parseInt(normalized, 10);
  const roomType = findRoomType(session.data.roomTypeId);

  if (!roomType) {
    session.state = STATES.ASK_ROOM_TYPE;
    saveSession(to, session);
    return sendRoomTypeList(to);
  }

  if (!Number.isInteger(guests) || guests <= 0) {
    return sendText(to, 'Ese número no lo agarré bien 🙈. Escribe solo la cantidad de huéspedes, por ejemplo: 2');
  }

  // Grupos que no caben en UNA sola habitación (hoy, más de 6): el bot no
  // arma combinaciones de varias habitaciones automático (necesitaría
  // llevar inventario/disponibilidad real por habitación — eso es fase 2),
  // así que se atienden a mano. Se manda ANTES de checar la habitación
  // puntual que eligieron, porque el problema no es esa habitación: es que
  // necesitan más de una.
  const maxCapacity = getOverallMaxCapacity();
  if (guests > maxCapacity) {
    await sendText(
      to,
      `Para ${guests} personas normalmente combinamos varias habitaciones para acomodar a todo el grupo 🙂. Escribe *agente* y el equipo del hotel te arma la mejor combinación y el precio total.`
    );
    await notifyStaff(
      `👥 Grupo grande: ${to} preguntó por ${guests} huéspedes (partió de ${roomType.name}) — necesita combinar varias habitaciones, seguimiento manual.`
    );
    resetSession(to);
    return;
  }

  if (!guestsFitRoom(roomType, guests)) {
    const { min, max } = getCapacityRange(roomType);
    return sendText(
      to,
      `${roomType.name} admite de ${min} a ${max} huéspedes. Escribe un número dentro de ese rango, o escribe *cotizar* para elegir otra habitación.`
    );
  }

  session.data.guests = guests;
  session.state = STATES.ASK_CHECKIN;
  saveSession(to, session);
  return sendAskCheckIn(to);
}

async function handleAskCheckIn(to, session, { text }) {
  const date = parseFlexibleDate(text);
  if (!date) {
    return sendText(to, 'No logré leer esa fecha 🙈. Prueba con día/mes/año (14/09/2026), "14 de septiembre de 2026", o escribe "hoy"/"mañana".');
  }
  if (!isTodayOrFuture(date)) {
    return sendText(to, 'Esa fecha ya pasó 😅. Dame una fecha de entrada a partir de hoy.');
  }

  session.data.checkIn = date.toISOString();
  session.state = STATES.ASK_CHECKOUT;
  saveSession(to, session);
  return sendAskCheckOut(to);
}

async function handleAskCheckOut(to, session, { text }) {
  const date = parseFlexibleDate(text);
  if (!date) {
    return sendText(to, 'No logré leer esa fecha 🙈. Prueba con día/mes/año (16/09/2026), o "16 de septiembre de 2026".');
  }
  const checkIn = new Date(session.data.checkIn);
  if (!isAfter(date, checkIn)) {
    return sendText(to, 'La fecha de salida debe ser posterior a la de entrada. ¿Cuál sería tu fecha de salida?');
  }

  session.data.checkOut = date.toISOString();
  saveSession(to, session);
  return sendQuoteSummary(to, session);
}

async function handleConfirmSummary(to, session, { interactiveId }) {
  if (interactiveId === 'confirm_reservar') {
    const { roomTypeId, guests, checkIn, checkOut } = session.data;
    const roomType = findRoomType(roomTypeId);
    const resumen = roomType
      ? `${roomType.name} · ${guests} huésped(es) · ${formatDateEs(new Date(checkIn))} → ${formatDateEs(new Date(checkOut))}`
      : 'detalles no disponibles';

    await sendText(
      to,
      '¡Excelente! 🎉 Un miembro del equipo de Hotel Posada Cocomacan confirmará disponibilidad y te contactará por este mismo chat para completar tu reserva.'
    );
    await notifyStaff(`✅ Nueva solicitud de reservación\nCliente: ${to}\n${resumen}\n\nContáctalo por este mismo WhatsApp para confirmar y cerrar.`);
    resetSession(to);
    return;
  }
  if (interactiveId === 'confirm_otra') {
    session.state = STATES.ASK_ROOM_TYPE;
    session.data = {};
    saveSession(to, session);
    return sendRoomTypeList(to);
  }
  if (interactiveId === 'confirm_menu') {
    resetSession(to);
    return sendMainMenu(to);
  }

  return sendText(to, 'Puedes tocar uno de los botones de arriba, o escribir *menú* para empezar de nuevo.');
}

async function handleFaqMode(to, session, { text }) {
  const reply = await answerFaq(text);
  return sendText(to, reply);
}
