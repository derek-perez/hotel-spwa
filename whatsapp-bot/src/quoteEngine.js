import { findRoomType } from './hotelData.js';
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

/**
 * Calcula una cotización. Devuelve uno de dos resultados:
 *  - { ok: true, needsManualQuote: true, roomType }              (suites "Consultar cotización")
 *  - { ok: true, needsManualQuote: false, roomType, nights, pricePerNight, total }
 *  - { ok: false, reason: 'invalid_room' | 'invalid_dates' | 'guests_out_of_range' }
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
