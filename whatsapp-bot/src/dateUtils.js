// Parseo de fechas tolerante a lo que la gente realmente escribe en WhatsApp.
// Soporta: "hoy", "mañana"/"manana", "dd/mm/aaaa", "dd-mm-aaaa", "aaaa-mm-dd".
// Todo se normaliza a medianoche en horario local del servidor.

function stripAccents(str) {
  return str.normalize('NFD').replace(/[̀-ͯ]/g, '');
}

function atMidnight(date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function parseFlexibleDate(input) {
  if (!input || typeof input !== 'string') return null;
  const text = stripAccents(input.trim().toLowerCase());

  const today = atMidnight(new Date());

  if (text === 'hoy') return today;
  if (text === 'manana') {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return d;
  }

  // dd/mm/aaaa o dd-mm-aaaa
  let match = text.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isValidRealDate(d, Number(dd), Number(mm) - 1, Number(yyyy))) return atMidnight(d);
    return null;
  }

  // aaaa-mm-dd (ISO)
  match = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) {
    const [, yyyy, mm, dd] = match;
    const d = new Date(Number(yyyy), Number(mm) - 1, Number(dd));
    if (isValidRealDate(d, Number(dd), Number(mm) - 1, Number(yyyy))) return atMidnight(d);
    return null;
  }

  return null;
}

function isValidRealDate(d, day, monthIndex, year) {
  return (
    d.getFullYear() === year &&
    d.getMonth() === monthIndex &&
    d.getDate() === day
  );
}

export function isTodayOrFuture(date) {
  const today = atMidnight(new Date());
  return atMidnight(date).getTime() >= today.getTime();
}

export function isAfter(dateA, dateB) {
  return atMidnight(dateA).getTime() > atMidnight(dateB).getTime();
}

export function nightsBetween(checkIn, checkOut) {
  const MS_PER_DAY = 24 * 60 * 60 * 1000;
  return Math.round((atMidnight(checkOut).getTime() - atMidnight(checkIn).getTime()) / MS_PER_DAY);
}

export function formatDateEs(date) {
  return atMidnight(date).toLocaleDateString('es-MX', {
    day: '2-digit',
    month: 'long',
    year: 'numeric',
  });
}
