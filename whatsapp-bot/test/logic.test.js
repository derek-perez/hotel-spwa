import { computeQuote, guestsFitRoom, getCapacityRange } from '../src/quoteEngine.js';
import { parseFlexibleDate, nightsBetween, isAfter, isTodayOrFuture, formatDateEs } from '../src/dateUtils.js';
import { findRoomType, listRoomTypes } from '../src/hotelData.js';

function assert(cond, msg) {
  if (!cond) {
    console.error('❌ FAIL:', msg);
    process.exitCode = 1;
  } else {
    console.log('✅', msg);
  }
}

// --- hotelData ---
assert(listRoomTypes().length === 5, 'hotelData: 5 tipos de habitación cargados');
assert(findRoomType('double_room').name === 'Habitación Doble', 'hotelData: encuentra double_room');
assert(findRoomType('no_existe') === null, 'hotelData: room inexistente => null');

// --- dateUtils ---
const d1 = parseFlexibleDate('14/09/2026');
assert(d1 && d1.getFullYear() === 2026 && d1.getMonth() === 8 && d1.getDate() === 14, 'dateUtils: parsea dd/mm/aaaa');

const d2 = parseFlexibleDate('2026-09-16');
assert(d2 && d2.getMonth() === 8 && d2.getDate() === 16, 'dateUtils: parsea ISO aaaa-mm-dd');

assert(parseFlexibleDate('31/02/2026') === null, 'dateUtils: rechaza fecha imposible (31 feb)');
assert(parseFlexibleDate('mañana') !== null, 'dateUtils: entiende "mañana"');
assert(parseFlexibleDate('hoy') !== null, 'dateUtils: entiende "hoy"');
assert(parseFlexibleDate('mmm') === null, 'dateUtils: texto basura => null');

assert(nightsBetween(d1, d2) === 2, 'dateUtils: nightsBetween 14->16 sep = 2 noches');
assert(isAfter(d2, d1) === true, 'dateUtils: 16 sep es después de 14 sep');
assert(isTodayOrFuture(new Date(2020, 0, 1)) === false, 'dateUtils: fecha pasada no es hoy/futuro');
console.log('   formatDateEs ejemplo:', formatDateEs(d1));

// --- quoteEngine ---
const doubleRoom = findRoomType('double_room');
assert(guestsFitRoom(doubleRoom, 4) === true, 'quoteEngine: 4 huéspedes cabe en doble (3-4)');
assert(guestsFitRoom(doubleRoom, 1) === false, 'quoteEngine: 1 huésped NO cabe en doble (3-4)');

const capDouble = getCapacityRange(doubleRoom);
assert(capDouble.min === 3 && capDouble.max === 4, 'quoteEngine: rango de capacidad doble = 3-4');

const q1 = computeQuote({ roomTypeId: 'double_room', guests: 4, checkIn: d1, checkOut: d2 });
assert(q1.ok && !q1.needsManualQuote && q1.nights === 2 && q1.pricePerNight === 1200 && q1.total === 2400, 'quoteEngine: doble 4 huéspedes x 2 noches = $2400');

const q2 = computeQuote({ roomTypeId: 'suite_junior', guests: 2, checkIn: d1, checkOut: d2 });
assert(q2.ok && q2.needsManualQuote === true, 'quoteEngine: suite_junior => needsManualQuote');

const q3 = computeQuote({ roomTypeId: 'single_room', guests: 5, checkIn: d1, checkOut: d2 });
assert(q3.ok === false && q3.reason === 'guests_out_of_range', 'quoteEngine: 5 huéspedes en sencilla => fuera de rango');

const q4 = computeQuote({ roomTypeId: 'single_room', guests: 1, checkIn: d2, checkOut: d1 });
assert(q4.ok === false && q4.reason === 'invalid_dates', 'quoteEngine: checkout antes que checkin => invalid_dates');

const q5 = computeQuote({ roomTypeId: 'single_room', guests: 1, checkIn: d1, checkOut: d1 });
assert(q5.ok === false && q5.reason === 'invalid_dates', 'quoteEngine: 0 noches (mismo día) => invalid_dates');

const singleRoom = findRoomType('single_room');
const q6 = computeQuote({ roomTypeId: 'single_room', guests: 1, checkIn: d1, checkOut: d2 });
assert(q6.pricePerNight === 700, 'quoteEngine: sencilla 1 huésped = $700/noche');
const q7 = computeQuote({ roomTypeId: 'single_room', guests: 2, checkIn: d1, checkOut: d2 });
assert(q7.pricePerNight === 900, 'quoteEngine: sencilla 2 huéspedes = $900/noche');

console.log('\nListo.');
