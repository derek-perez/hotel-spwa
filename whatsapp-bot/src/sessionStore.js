// Sesiones en memoria, una por número de WhatsApp (wa_id).
//
// OJO — limitación consciente para esta v1: si el proceso se reinicia
// (Render free tier duerme el servicio tras inactividad y lo despierta de
// cero), las conversaciones a medias se pierden y el usuario simplemente
// vuelve a ver el menú principal. No perdemos reservas reales porque el
// bot no confirma reservas por sí mismo (ver README) — solo cotiza y
// responde FAQs. Si esto se vuelve un problema, la solución es mover esto
// a Redis o a un archivo/SQLite; el resto del código no cambia porque todo
// pasa por getSession/saveSession.

const SESSION_TTL_MS = 45 * 60 * 1000; // 45 min de inactividad = sesión nueva

export const STATES = {
  MAIN_MENU: 'MAIN_MENU',
  ASK_ROOM_TYPE: 'ASK_ROOM_TYPE',
  ASK_GUESTS: 'ASK_GUESTS',
  ASK_CHECKIN: 'ASK_CHECKIN',
  ASK_CHECKOUT: 'ASK_CHECKOUT',
  CONFIRM_SUMMARY: 'CONFIRM_SUMMARY',
  FAQ_MODE: 'FAQ_MODE',
};

const sessions = new Map();

function freshSession() {
  return {
    state: STATES.MAIN_MENU,
    data: {},
    updatedAt: Date.now(),
  };
}

export function getSession(waId) {
  const existing = sessions.get(waId);
  if (!existing || Date.now() - existing.updatedAt > SESSION_TTL_MS) {
    const fresh = freshSession();
    sessions.set(waId, fresh);
    return fresh;
  }
  return existing;
}

export function saveSession(waId, session) {
  session.updatedAt = Date.now();
  sessions.set(waId, session);
}

export function resetSession(waId) {
  const fresh = freshSession();
  sessions.set(waId, fresh);
  return fresh;
}

// Limpieza periódica para no acumular memoria indefinidamente en un
// proceso de larga duración.
setInterval(() => {
  const now = Date.now();
  for (const [waId, session] of sessions.entries()) {
    if (now - session.updatedAt > SESSION_TTL_MS) sessions.delete(waId);
  }
}, 10 * 60 * 1000).unref();
