// Parseo de fechas tolerante a lo que la gente realmente escribe en WhatsApp.
// Soporta: "hoy", "mañana"/"manana", "dd/mm/aaaa", "dd-mm-aaaa", "aaaa-mm-dd",
// y "14 de septiembre de 2026" (el formato largo en español que usa
// formatDatePretty() del sitio web — así el mensaje pre-armado que llega
// desde "Consultar disponibilidad" se puede leer directo, sin que el
// huésped tenga que volver a escribir la fecha).
// Todo se normaliza a medianoche en horario local del servidor.

const MESES_ES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

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

  // "14 de septiembre de 2026" — formato largo en español (sin acentos ya
  // por el stripAccents de arriba, por eso el arreglo MESES_ES no los lleva).
  match = text.match(/^(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})$/);
  if (match) {
    const [, dd, monthName, yyyy] = match;
    const monthIndex = MESES_ES.indexOf(monthName);
    if (monthIndex === -1) return null;
    const d = new Date(Number(yyyy), monthIndex, Number(dd));
    if (isValidRealDate(d, Number(dd), monthIndex, Number(yyyy))) return atMidnight(d);
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
