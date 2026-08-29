import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Fuente única de verdad: el MISMO hotel-data.json que consume el sitio.
// Así, si mañana cambian una tarifa o agregan una habitación ahí, el bot
// se actualiza solo sin tocar código.
const DATA_PATH = path.join(__dirname, '..', '..', 'hotel-data.json');

function load() {
  const raw = readFileSync(DATA_PATH, 'utf-8');
  return JSON.parse(raw);
}

// Cache simple en memoria; se recarga si el archivo cambia (útil en dev,
// inofensivo en producción porque el archivo no cambia en caliente ahí).
let cached = load();

export function getHotelData() {
  return cached;
}

export function reloadHotelData() {
  cached = load();
  return cached;
}

export function findRoomType(roomTypeId) {
  return getHotelData().room_types.find((r) => r.id === roomTypeId) || null;
}

export function listRoomTypes() {
  return getHotelData().room_types;
}
