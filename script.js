/* ===================================================================
   Hotel Posada Cocomacan — SPWA Logic
   Vanilla JS ES6+ — Consumo dinámico de hotel-data.json
=================================================================== */

(() => {
  'use strict';

  /* -----------------------------------------------------------------
   * 0. Datos de respaldo (fallback) — se usa únicamente si el fetch()
   *    de hotel-data.json falla (p.ej. al abrir index.html con doble
   *    clic mediante protocolo file://, donde el navegador bloquea
   *    peticiones fetch a archivos locales por CORS).
   * ------------------------------------------------------------- */
  let HOTEL_DATA_URL = './hotel-data.json';

  /* -----------------------------------------------------------------
   * 1. Utilidades
   * ------------------------------------------------------------- */
  const $ = (selector, scope = document) => scope.querySelector(selector);
  const $$ = (selector, scope = document) => [...scope.querySelectorAll(selector)];

  const todayISO = () => new Date().toISOString().split('T')[0];

  const addDays = (isoDate, days) => {
    const d = new Date(isoDate);
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  const formatDatePretty = (isoDate) => {
    if (!isoDate) return 'Por definir';
    const [y, m, d] = isoDate.split('-').map(Number);
    const date = new Date(y, m - 1, d);
    return date.toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  };

  const formatPrice = (price) => {
    if (typeof price === 'number') {
      return `$${price.toLocaleString('es-MX')}`;
    }
    return price; // e.g. "Consultar cotización"
  };

  // Mapeo de palabras clave de características -> ícono Lucide
  const FEATURE_ICON_MAP = [
    { match: /wi-?fi/i, icon: 'wifi' },
    { match: /agua caliente/i, icon: 'droplets' },
    { match: /baño/i, icon: 'bath' },
    { match: /tv|cable/i, icon: 'tv' },
    { match: /limpieza/i, icon: 'sparkles' },
    { match: /espacio|vista/i, icon: 'sparkle' },
  ];
  const iconForFeature = (feature) => {
    const found = FEATURE_ICON_MAP.find((f) => f.match.test(feature));
    return found ? found.icon : 'check-circle';
  };

  const refreshIcons = () => {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  };

  /* -----------------------------------------------------------------
   * 2. Carga de datos
   * ------------------------------------------------------------- */
  async function loadHotelData() {
    try {
      const res = await fetch(HOTEL_DATA_URL, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      console.warn(
        '[Hotel Posada Cocomacan] No se pudo cargar hotel-data.json vía fetch ' +
        '(esto ocurre normalmente si abriste el archivo con doble clic en vez de ' +
        'servirlo con un servidor local). Sirve el sitio con un servidor HTTP ' +
        '(por ejemplo: "npx serve ." o la extensión Live Server) para consumir el ' +
        'JSON dinámicamente.',
        err
      );
      return null;
    }
  }

  /* -----------------------------------------------------------------
   * 3. Motor de WhatsApp
   * ------------------------------------------------------------- */
  function buildWhatsAppLink(whatsappNumber, { checkin, checkout, roomOrGuests }) {
    const message =
      `¡Hola! Me gustaría consultar disponibilidad en Hotel Posada Cocomacan.\n\n` +
      `📅 Entrada: ${checkin}\n` +
      `📅 Salida: ${checkout}\n` +
      `🛏 Habitación / Huéspedes: ${roomOrGuests}\n\n` +
      `¿Tienen espacio disponible para estas fechas?`;

    return `https://wa.me/${whatsappNumber}?text=${encodeURIComponent(message)}`;
  }

  function openWhatsApp(whatsappNumber, details) {
    const url = buildWhatsAppLink(whatsappNumber, details);
    window.open(url, '_blank', 'noopener,noreferrer');
  }

  /* -----------------------------------------------------------------
   * 4. Render: Habitaciones
   * ------------------------------------------------------------- */
  function renderRoomRate(room) {
    if (!room.rates || !room.rates.length) return '<span class="price-tag text-2xl">Consultar</span>';

    if (room.rates.length === 1) {
      const rate = room.rates[0];
      return `
        <div class="flex items-baseline gap-1">
          <span class="price-tag text-2xl sm:text-3xl">${formatPrice(rate.price_mxn)}</span>
          ${typeof rate.price_mxn === 'number' ? '<span class="text-carbon-soft text-sm font-medium">MXN /noche</span>' : ''}
        </div>`;
    }

    // Múltiples tarifas (p.ej. Habitación Sencilla: 1 o 2 personas)
    const lowest = room.rates.reduce((min, r) => (typeof r.price_mxn === 'number' && r.price_mxn < min ? r.price_mxn : min), Infinity);
    const breakdown = room.rates
      .map((r) => `<span class="block">${r.guests} ${r.guests === 1 ? 'persona' : 'personas'}: <strong>${formatPrice(r.price_mxn)}</strong></span>`)
      .join('');

    return `
      <div>
        <div class="flex items-baseline gap-1">
          <span class="text-carbon-soft text-xs font-semibold uppercase tracking-wide">Desde</span>
        </div>
        <div class="flex items-baseline gap-1">
          <span class="price-tag text-2xl sm:text-3xl">${formatPrice(lowest)}</span>
          <span class="text-carbon-soft text-sm font-medium">MXN /noche</span>
        </div>
        <div class="text-xs text-carbon-soft mt-1 leading-relaxed">${breakdown}</div>
      </div>`;
  }

  function roomCardTemplate(room) {
    const badges = room.common_features
      .map((f) => `<span class="feature-badge"><i data-lucide="${iconForFeature(f)}" class="w-3.5 h-3.5"></i>${f}</span>`)
      .join('');

    return `
      <article class="room-card" data-room-id="${room.id}">
        <div class="room-image-wrap">
          <img src="${room.image}" alt="${room.name} — Hotel Posada Cocomacan" loading="lazy" />
          <span class="absolute top-3 left-3 bg-white/90 backdrop-blur-sm text-carbon text-xs font-semibold px-3 py-1.5 rounded-full shadow-sm flex items-center gap-1.5">
            <i data-lucide="users" class="w-3.5 h-3.5"></i> ${room.capacity}
          </span>
        </div>
        <div class="p-5 sm:p-6 flex flex-col flex-1">
          <h3 class="font-display font-bold text-xl sm:text-2xl text-carbon">${room.name}</h3>
          <p class="flex items-center gap-1.5 text-sm text-carbon-soft mt-1.5">
            <i data-lucide="bed" class="w-4 h-4 text-terracota"></i> ${room.beds}
          </p>
          ${room.description ? `<p class="text-sm text-carbon-soft mt-2 leading-relaxed">${room.description}</p>` : ''}

          <div class="flex flex-wrap gap-2 mt-4">${badges}</div>

          <div class="mt-5 pt-5 border-t border-arena-dark/40 flex items-end justify-between gap-3">
            ${renderRoomRate(room)}
          </div>

          <button
            class="consult-room-btn mt-5 w-full inline-flex items-center justify-center gap-2 bg-terracota hover:bg-terracota-dark text-white font-semibold px-5 py-3 rounded-full transition-all hover:scale-[1.02] active:scale-95"
            data-room-name="${room.name}"
            type="button">
            <i data-lucide="message-circle" class="w-4 h-4"></i>
            Consultar esta Habitación
          </button>
        </div>
      </article>`;
  }

  function renderRooms(data) {
    const grid = $('#rooms-grid');
    if (!grid) return;
    grid.innerHTML = data.room_types.map(roomCardTemplate).join('');
  }

  function populateRoomSelect(data) {
    const select = $('#room-select');
    if (!select) return;
    const options = data.room_types
      .map((room) => `<option value="${room.name}">${room.name}</option>`)
      .join('');
    select.insertAdjacentHTML('beforeend', options);
  }

  /* -----------------------------------------------------------------
   * 5. Render: Amenidades
   * ------------------------------------------------------------- */
  function amenityCardTemplate(amenity) {
    return `
      <div class="amenity-card">
        <span class="amenity-icon"><i data-lucide="${amenity.icon || 'check'}" class="w-6 h-6"></i></span>
        <h3 class="font-display font-semibold text-sm sm:text-base leading-snug">${amenity.name}</h3>
        <p class="text-arena/75 text-xs mt-1.5 leading-relaxed hidden sm:block">${amenity.description}</p>
      </div>`;
  }

  function renderAmenities(data) {
    const grid = $('#amenities-grid');
    if (grid) grid.innerHTML = data.general_amenities.map(amenityCardTemplate).join('');

    const gallery = $('#amenities-gallery');
    const images = data.hotel_info?.media?.amenities_gallery || [];
    if (gallery && images.length) {
      gallery.innerHTML = images
        .map((src) => `<div class="gallery-thumb"><img src="${src}" alt="Hotel Posada Cocomacan" loading="lazy" /></div>`)
        .join('');
    }

    const checkin = $('#policy-checkin');
    const checkout = $('#policy-checkout');
    if (checkin) checkin.textContent = data.hotel_info.policies.check_in;
    if (checkout) checkout.textContent = data.hotel_info.policies.check_out;
  }

  /* -----------------------------------------------------------------
   * 6. Render: Ubicación
   * ------------------------------------------------------------- */
  function highlightCardTemplate(item) {
    return `
      <div class="highlight-card">
        <span class="highlight-icon"><i data-lucide="${item.icon || 'map-pin'}" class="w-5 h-5"></i></span>
        <div>
          <div class="flex items-center gap-2">
            <h3 class="font-semibold text-carbon">${item.title}</h3>
            <span class="text-xs font-semibold text-oliva bg-oliva/10 px-2 py-0.5 rounded-full">${item.distance}</span>
          </div>
          <p class="text-sm text-carbon-soft mt-1 leading-relaxed">${item.description}</p>
        </div>
      </div>`;
  }

  function renderLocation(data) {
    const list = $('#location-highlights');
    if (list) list.innerHTML = data.location_highlights.map(highlightCardTemplate).join('');

    const fullAddress = data.hotel_info.address.full_address;
    const addrEl = $('#location-address');
    if (addrEl) addrEl.textContent = fullAddress;

    const mapFrame = $('#map-embed');
    if (mapFrame) {
      mapFrame.src = `https://www.google.com/maps?q=${encodeURIComponent(fullAddress)}&output=embed`;
    }

    const locationImage = data.hotel_info?.media?.location_image;
    if (locationImage) {
      const locImgEl = $('#ubicacion img');
      if (locImgEl) locImgEl.src = locationImage;
    }
  }

  /* -----------------------------------------------------------------
   * 7. Render: Hero, Footer y datos generales
   * ------------------------------------------------------------- */
  function renderGeneralInfo(data) {
    const { hotel_info } = data;

    const heroImg = $('#hero-image');
    if (heroImg && hotel_info?.media?.hero_image) heroImg.src = hotel_info.media.hero_image;

    const heroSlogan = $('#hero-slogan');
    if (heroSlogan && hotel_info.slogan) heroSlogan.textContent = hotel_info.slogan;

    // Footer
    const footerAddress = $('#footer-address');
    if (footerAddress) footerAddress.textContent = hotel_info.address.full_address;

    const footerWhatsapp = $('#footer-whatsapp');
    if (footerWhatsapp) {
      footerWhatsapp.textContent = hotel_info.contact.whatsapp_display;
      footerWhatsapp.href = `https://wa.me/${hotel_info.contact.whatsapp_number}`;
      footerWhatsapp.target = '_blank';
      footerWhatsapp.rel = 'noopener noreferrer';
    }

    const footerCheckin = $('#footer-checkin');
    const footerCheckout = $('#footer-checkout');
    if (footerCheckin) footerCheckin.textContent = hotel_info.policies.check_in;
    if (footerCheckout) footerCheckout.textContent = hotel_info.policies.check_out;

    const currentYear = $('#current-year');
    if (currentYear) currentYear.textContent = new Date().getFullYear();

    // WhatsApp floating button — mensaje genérico
    const waFloat = $('#whatsapp-float');
    if (waFloat) {
      waFloat.href = buildWhatsAppLink(hotel_info.contact.whatsapp_number, {
        checkin: 'Por definir',
        checkout: 'Por definir',
        roomOrGuests: 'Por definir',
      });
    }
  }

  /* -----------------------------------------------------------------
   * 8. Navbar: scroll + menú móvil
   * ------------------------------------------------------------- */
  function initNavbar() {
    const navbar = $('#navbar');
    const onScroll = () => {
      if (window.scrollY > 40) navbar.classList.add('scrolled');
      else navbar.classList.remove('scrolled');
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });

    const menuToggle = $('#menu-toggle');
    const mobileMenu = $('#mobile-menu');

    // Nota: los íconos se consultan en vivo (no se cachean) porque
    // lucide.createIcons() reemplaza los <i data-lucide> originales por
    // elementos <svg> nuevos; una referencia cacheada antes de esa
    // conversión quedaría apuntando a un nodo desconectado del DOM.
    const closeMenu = () => {
      mobileMenu.classList.remove('open');
      menuToggle.setAttribute('aria-expanded', 'false');
      $('#menu-icon-open')?.classList.remove('hidden');
      $('#menu-icon-close')?.classList.add('hidden');
    };

    menuToggle.addEventListener('click', () => {
      const isOpen = mobileMenu.classList.toggle('open');
      menuToggle.setAttribute('aria-expanded', String(isOpen));
      $('#menu-icon-open')?.classList.toggle('hidden', isOpen);
      $('#menu-icon-close')?.classList.toggle('hidden', !isOpen);
    });

    $$('#mobile-menu a').forEach((link) => link.addEventListener('click', closeMenu));
  }

  /* -----------------------------------------------------------------
   * 9. Fechas del formulario de reserva rápida
   * ------------------------------------------------------------- */
  function initDateFields() {
    const checkin = $('#checkin');
    const checkout = $('#checkout');
    if (!checkin || !checkout) return;

    const min = todayISO();
    checkin.min = min;
    checkin.value = min;
    checkout.min = addDays(min, 1);
    checkout.value = addDays(min, 1);

    checkin.addEventListener('change', () => {
      const nextDay = addDays(checkin.value || min, 1);
      checkout.min = nextDay;
      if (!checkout.value || checkout.value <= checkin.value) {
        checkout.value = nextDay;
      }
    });
  }

  /* -----------------------------------------------------------------
   * 10. Formularios -> WhatsApp
   * ------------------------------------------------------------- */
  function initBookingForm(hotelInfo) {
    const form = $('#quick-booking-form');
    if (!form) return;

    form.addEventListener('submit', (e) => {
      e.preventDefault();

      const checkin = $('#checkin').value;
      const checkout = $('#checkout').value;
      const roomSelect = $('#room-select');
      const guests = $('#guests').value;

      const roomName = roomSelect.value;
      const roomOrGuests = roomName
        ? `${roomName} — ${guests} ${guests === '1' ? 'huésped' : 'huéspedes'}`
        : `${guests} ${guests === '1' ? 'huésped' : 'huéspedes'} (sin preferencia de habitación)`;

      openWhatsApp(hotelInfo.contact.whatsapp_number, {
        checkin: formatDatePretty(checkin),
        checkout: formatDatePretty(checkout),
        roomOrGuests,
      });
    });
  }

  function initRoomCardButtons(hotelInfo) {
    const grid = $('#rooms-grid');
    if (!grid) return;

    grid.addEventListener('click', (e) => {
      const btn = e.target.closest('.consult-room-btn');
      if (!btn) return;

      const roomName = btn.dataset.roomName;
      const checkin = $('#checkin')?.value;
      const checkout = $('#checkout')?.value;
      const guests = $('#guests')?.value || '2';

      openWhatsApp(hotelInfo.contact.whatsapp_number, {
        checkin: formatDatePretty(checkin),
        checkout: formatDatePretty(checkout),
        roomOrGuests: `${roomName} — ${guests} ${guests === '1' ? 'huésped' : 'huéspedes'}`,
      });
    });
  }

  /* -----------------------------------------------------------------
   * 11. Init general
   * ------------------------------------------------------------- */
  async function init() {
    initNavbar();
    initDateFields();

    const data = await loadHotelData();

    if (!data) {
      // Sin datos: muestra un aviso discreto en la sección de habitaciones.
      const grid = $('#rooms-grid');
      if (grid) {
        grid.innerHTML = `
          <div class="col-span-full text-center py-10 px-6 bg-white rounded-2xl border border-terracota/20">
            <p class="text-carbon-soft">
              No se pudo cargar <code>hotel-data.json</code>. Si abriste este archivo directamente
              desde el explorador de archivos, ejecútalo mediante un servidor local
              (por ejemplo <code>npx serve .</code>) para ver todo el contenido dinámico.
            </p>
          </div>`;
      }
      refreshIcons();
      return;
    }

    renderGeneralInfo(data);
    renderRooms(data);
    populateRoomSelect(data);
    renderAmenities(data);
    renderLocation(data);

    initBookingForm(data.hotel_info);
    initRoomCardButtons(data.hotel_info);

    refreshIcons();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
