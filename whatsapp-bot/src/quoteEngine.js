import { findRoomType, getHotelData, listRoomTypes } from './hotelData.js';
import { nightsBetween } from './dateUtils.js';

// Los rates en hotel-data.json vienen en dos formas:
//   { guests: 1, price_mxn: 700 }          <- número exacto
//   { guests: "3-4", price_mxn: 1200 }     <- rango como string
// parseGuestRange normaliza ambos a [min, max].
function parseGuestRange(guestsField) {
  if (typeof guestsField === 'number') return [guestsField, guestsField];
  const match = String(guestsField).match(/^(\d+)\s*-\s*(\d+)$/);
  if (match) return [Number(match[1]), Number(match[2])];
  const asNumber = Number(guestsField);
  return Number.isNaN(asNumber) ? [0, 0] : [asNumber, asNumber];
}

export function getCapacityRange(roomType) {
  const [min, max] = roomType.rates.reduce(
    ([accMin, accMax], rate) => {
      const [rMin, rMax] = parseGuestRange(rate.guests);
      return [Math.min(accMin, rMin), Math.max(accMax, rMax)];
    },
    [Infinity, -Infinity]
  );
  return { min, max };
}

export function guestsFitRoom(roomType, guests) {
  return roomType.rates.some((rate) => {
    const [min, max] = parseGuestRange(rate.guests);
    return guests >= min && guests <= max;
  });
}

function findRateForGuests(roomType, guests) {
  return roomType.rates.find((rate) => {
    const [min, max] = parseGuestRange(rate.guests);
    return guests >= min && guests <= max;
  });
}

// La capacidad máxima que cabe en UNA sola habitación (hoy: 6, la Triple).
// Se calcula de hotel-data.json en vez de fijarla a mano, para que si algún
// día agregan una habitación con más cupo esto se ajuste solo. Grupos por
// arriba de este número necesitan combinar varias habitaciones — algo que
// este bot todavía no arma automático (no lleva inventario/disponibilidad
// por habitación), así que se atienden a mano vía el equipo del hotel.
export function getOverallMaxCapacity() {
  return listRoomTypes().reduce((max, rt) => Math.max(max, getCapacityRange(rt).max), 0);
}

// Bloqueos de disponibilidad (hotel-data.json → blackout_dates). Cada
// entrada tiene { start, end } en formato aaaa-mm-dd, ambas fechas
// INCLUSIVAS (última noche bloqueada = "end"), y opcionalmente
// room_type_ids: si viene vacío o ausente, el bloqueo aplica a TODAS las
// habitaciones.
function findBlockingBlackout({ roomTypeId, checkIn, checkOut }) {
  const { blackout_dates: blackoutDates = [] } = getHotelData();
  return (
    blackoutDates.find((b) => {
      const appliesToRoom = !b.room_type_ids || b.room_type_ids.length === 0 || b.room_type_ids.includes(roomTypeId);
      if (!appliesToRoom) return false;

      const start = new Date(`${b.start}T00:00:00`);
      const end = new Date(`${b.end}T00:00:00`);
      end.setDate(end.getDate() + 1); // "end" es inclusivo -> límite exclusivo para comparar

      // Se traslapan si la estancia empieza antes de que termine el bloqueo
      // Y termina después de que empieza el bloqueo.
      return checkIn < end && checkOut > start;
    }) || null
  );
}

/**
 * Calcula una cotización. Devuelve uno de estos resultados:
 *  - { ok: true, needsManualQuote: true, roomType }              (suites "Consultar cotización")
 *  - { ok: true, needsManualQuote: false, roomType, nights, pricePerNight, total }
 *  - { ok: false, reason: 'invalid_room' | 'invalid_dates' | 'guests_out_of_range' | 'no_availability', blackout? }
 */
export function computeQuote({ roomTypeId, guests, checkIn, checkOut }) {
  const roomType = findRoomType(roomTypeId);
  if (!roomType) return { ok: false, reason: 'invalid_room' };

  const nights = nightsBetween(checkIn, checkOut);
  if (!Number.isFinite(nights) || nights < 1) {
    return { ok: false, reason: 'invalid_dates' };
  }

  const rate = findRateForGuests(roomType, guests);
  if (!rate) return { ok: false, reason: 'guests_out_of_range' };

  const blackout = findBlockingBlackout({ roomTypeId, checkIn, checkOut });
  if (blackout) {
    return { ok: false, reason: 'no_availability', roomType, nights, blackout };
  }

  if (typeof rate.price_mxn !== 'number') {
    // p.ej. "Consultar cotización" en las suites
    return { ok: true, needsManualQuote: true, roomType, nights };
  }

  return {
    ok: true,
    needsManualQuote: false,
    roomType,
    nights,
    pricePerNight: rate.price_mxn,
    total: rate.price_mxn * nights,
  };
}
